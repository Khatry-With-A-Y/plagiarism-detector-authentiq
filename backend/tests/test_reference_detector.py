"""
Unit tests for reference_detector module.
Tests reference section detection and citation pattern matching.
"""

import os
import sys
import unittest

# Add project root to sys.path to allow absolute imports from 'backend'
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
root_dir = os.path.dirname(backend_dir)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from backend.app.utils.reference_detector import ReferenceDetector


class TestReferenceDetector(unittest.TestCase):
    """Test suite for ReferenceDetector class"""

    @staticmethod
    def _build_realistic_document(body: str, references_header: str, references_block: str) -> str:
        """
        Build a realistic long paper so reference detection heuristics apply.

        Current detector intentionally skips short docs (< MIN_DOC_LENGTH) and
        searches only the tail of the document, so tests should mirror that.
        """
        preface = ("Main content paragraph discussing methods and results. " * 20 + "\n") * 20
        return f"{preface}\n{body}\n\n{references_header}\n\n{references_block}\n"
    
    def test_no_references_short_document(self):
        """Short documents should return no references"""
        short_text = "This is a short document without references."
        main, refs = ReferenceDetector.split_content_and_references(short_text)
        
        self.assertEqual(main, short_text)
        self.assertEqual(refs, "")
    
    def test_detect_references_section(self):
        """Should detect standard REFERENCES section"""
        text = self._build_realistic_document(
            body=(
                "This is the main content of the paper.\n"
                "It discusses various topics and ideas.\n"
                "The methodology is described here."
            ),
            references_header="REFERENCES",
            references_block=(
                "Smith, J. (2020). Title of paper. Journal Name, 10(2), 45-67.\n"
                "Jones, A., & Brown, B. (2019). Another paper. Conference Proceedings."
            ),
        )
        
        main, refs = ReferenceDetector.split_content_and_references(text)
        
        self.assertIn("main content", main)
        self.assertIn("methodology", main)
        self.assertNotIn("REFERENCES", main)
        self.assertIn("REFERENCES", refs)
        self.assertIn("Smith, J.", refs)
        self.assertIn("Jones, A.", refs)
    
    def test_detect_bibliography_section(self):
        """Should detect BIBLIOGRAPHY section"""
        text = self._build_realistic_document(
            body=(
                "Content of the research paper goes here.\n"
                "This is the introduction and literature review."
            ),
            references_header="BIBLIOGRAPHY",
            references_block=(
                "Author A. (2018). Book Title. Publisher.\n"
                "Author B. (2021). Article Title. Journal."
            ),
        )
        
        main, refs = ReferenceDetector.split_content_and_references(text)
        
        self.assertIn("Content of the research", main)
        self.assertNotIn("BIBLIOGRAPHY", main)
        self.assertIn("BIBLIOGRAPHY", refs)
        self.assertIn("Author A", refs)
    
    def test_detect_works_cited(self):
        """Should detect WORKS CITED section"""
        text = self._build_realistic_document(
            body=(
                "Essay content here with multiple paragraphs.\n"
                "Discussion of various topics."
            ),
            references_header="WORKS CITED",
            references_block=(
                "Smith, John. \"Article Title.\" Magazine Name, 2020.\n"
                "Doe, Jane. Book Title. Publishing House, 2019."
            ),
        )
        
        main, refs = ReferenceDetector.split_content_and_references(text)
        
        self.assertIn("Essay content", main)
        self.assertNotIn("WORKS CITED", main)
        self.assertIn("WORKS CITED", refs)
    
    def test_case_insensitive_detection(self):
        """Should detect references regardless of case"""
        text = self._build_realistic_document(
            body="Paper content here.",
            references_header="references",
            references_block=(
                "[1] Citation 1.\n"
                "[2] Citation 2."
            ),
        )
        
        main, refs = ReferenceDetector.split_content_and_references(text)
        
        self.assertIn("Paper content", main)
        self.assertNotIn("references", main.lower())
        self.assertIn("Citation 1", refs)
    
    def test_no_false_positive_on_word_references(self):
        """Should not split on the word 'references' in content"""
        text = """
        This paper references several previous studies.
        The references to prior work are important.
        These references inform our methodology.
        """
        
        main, refs = ReferenceDetector.split_content_and_references(text)
        
        # Should not split because "references" is not a standalone header
        self.assertEqual(main, text)
        self.assertEqual(refs, "")
    
    def test_citation_line_detection(self):
        """Should detect individual citation lines"""
        citations = [
            "[1] Author A. (2020). Title. Journal.",
            "Smith, J., & Jones, B. (2019). Paper title. Conference.",
            "Doe, J. (2018). Book Title. Publisher, pp. 123-145.",
            "Author, A. B. (2021). Article with DOI. doi:10.1234/example",
        ]
        
        for citation in citations:
            result = ReferenceDetector.is_citation_line(citation)
            self.assertTrue(result, f"Should detect citation: {citation}")
    
    def test_non_citation_line_detection(self):
        """Should not detect regular content as citations"""
        non_citations = [
            "This is a regular sentence in the paper.",
            "The methodology involves several steps.",
            "Results show significant findings.",
        ]
        
        for line in non_citations:
            result = ReferenceDetector.is_citation_line(line)
            self.assertFalse(result, f"Should not detect as citation: {line}")
    
    def test_references_at_end_of_document(self):
        """References should typically be at the end"""
        text = self._build_realistic_document(
            body=(
                "Introduction paragraph one.\n"
                "Introduction paragraph two.\n"
                "Methodology section here.\n"
                "Results and discussion.\n"
                "Conclusion paragraph."
            ),
            references_header="REFERENCES",
            references_block=(
                "[1] Citation 1\n"
                "[2] Citation 2\n"
                "[3] Citation 3\n"
                "Smith, J. (2020). Extra citation details."
            ),
        )
        
        detection = ReferenceDetector.detect_reference_section(text)
        
        self.assertIsNotNone(detection)
        self.assertTrue(detection['has_references'])
        # References should be in last 30% of document
        self.assertGreater(detection['start_position'] / len(text), 0.6)
    
    def test_multiple_reference_formats(self):
        """Should handle APA, IEEE, and other formats"""
        formats = [
            self._build_realistic_document(
                body="Content here.",
                references_header="REFERENCES",
                references_block="Smith, J. (2020). Title. Journal, 10(2), 45-67."
            ),
            self._build_realistic_document(
                body="Content here.",
                references_header="REFERENCES",
                references_block=(
                    "[1] A. Smith, \"Title,\" Journal, vol. 10, no. 2, pp. 45-67, 2020.\n"
                    "[2] B. Jones, \"Another,\" Conference, 2019."
                )
            ),
            self._build_realistic_document(
                body="Content here.",
                references_header="BIBLIOGRAPHY",
                references_block=(
                    "Smith, John. Title of Book. Publisher, 2020.\n"
                    "Jones, Bob, and Alice Brown. \"Article.\" Magazine 15 (2019): 20-30."
                )
            ),
        ]
        
        for fmt in formats:
            main, refs = ReferenceDetector.split_content_and_references(fmt)
            self.assertIn("Content here", main)
            self.assertTrue(len(refs) > 0)
    
    def test_remove_in_text_citations(self):
        """Should remove in-text citations from content"""
        text = """
        This study (Smith, 2020) shows results.
        Previous work [1] demonstrated findings.
        As noted by Jones et al. (2019), the method works.
        Research [2, 3, 4] supports this claim.
        """
        
        cleaned = ReferenceDetector.remove_in_text_citations(text)
        
        self.assertNotIn("(Smith, 2020)", cleaned)
        self.assertNotIn("[1]", cleaned)
        self.assertNotIn("[2, 3, 4]", cleaned)
        self.assertIn("This study", cleaned)
        self.assertIn("shows results", cleaned)
    
    def test_statistics_method(self):
        """Should return accurate statistics"""
        text = self._build_realistic_document(
            body=(
                "Main content paragraph one.\n"
                "Main content paragraph two."
            ),
            references_header="REFERENCES",
            references_block=(
                "[1] Citation 1\n"
                "[2] Citation 2\n"
                "Smith, J. (2020). Supporting citation metadata."
            ),
        )
        
        stats = ReferenceDetector.get_statistics(text)
        
        self.assertTrue(stats['has_references'])
        self.assertGreater(stats['main_content_length'], 0)
        self.assertGreater(stats['references_length'], 0)
        self.assertGreater(stats['reference_percentage'], 0)
        self.assertEqual(stats['header_found'], 'REFERENCES')
        self.assertGreater(stats['confidence'], 0.5)
    
    def test_confidence_calculation(self):
        """Should calculate higher confidence for typical reference sections"""
        # Good reference section: at end, multiple citations
        good_text = """
        """ + "Content paragraph. " * 100 + """
        
        REFERENCES
        
        [1] Smith, J. (2020). Title. Journal.
        [2] Jones, A. (2019). Paper. Conference.
        [3] Brown, B. (2018). Article. Magazine.
        [4] Davis, C. (2021). Book. Publisher.
        [5] Wilson, D. (2020). Study. Journal.
        """
        
        detection = ReferenceDetector.detect_reference_section(good_text)
        self.assertIsNotNone(detection)
        self.assertGreater(detection['confidence'], 0.7)
    
    def test_edge_case_empty_string(self):
        """Should handle empty string gracefully"""
        main, refs = ReferenceDetector.split_content_and_references("")
        self.assertEqual(main, "")
        self.assertEqual(refs, "")
    
    def test_edge_case_only_references(self):
        """Short references-only docs are intentionally not split (optimization)."""
        text = """
        REFERENCES
        
        Citation 1
        Citation 2
        Citation 3
        """
        
        main, refs = ReferenceDetector.split_content_and_references(text)
        
        self.assertEqual(main, text)
        self.assertEqual(refs, "")
    
    def test_performance_on_large_document(self):
        """Should perform efficiently on large documents"""
        import time
        
        # Create a large document (simulating 50-page paper)
        large_text = "Paragraph content. " * 10000 + "\n\nREFERENCES\n\n" + "Citation. " * 100
        
        start = time.time()
        main, refs = ReferenceDetector.split_content_and_references(large_text)
        elapsed = time.time() - start
        
        # Should complete in under 100ms
        self.assertLess(elapsed, 0.1, f"Detection took {elapsed*1000:.1f}ms, should be < 100ms")
        self.assertTrue(len(refs) > 0)


if __name__ == '__main__':
    unittest.main()
