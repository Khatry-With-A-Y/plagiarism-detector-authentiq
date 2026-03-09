import re

class TextProcessor:
    """Handles text cleaning and preprocessing"""
    
    @staticmethod
    def simple_stem(word):
        """Very basic stemming without external libraries"""
        if word.endswith('s'):   return word[:-1]
        if word.endswith('es'):  return word[:-2]
        if word.endswith('ing'): return word[:-3]
        if word.endswith('ed'):  return word[:-2]
        return word
    
    @staticmethod
    def clean_text(text):
        """Clean and preprocess text: lowercase, remove punctuation, simple stem"""
        text = text.lower()
        text = re.sub(r'[^a-z\s]', '', text)  # remove non-letter characters
        words = text.split()
        return [TextProcessor.simple_stem(w) for w in words if w]  # remove empty strings