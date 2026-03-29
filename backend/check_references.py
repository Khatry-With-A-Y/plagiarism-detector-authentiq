"""
Quick script to check the status of reference columns in the database
"""
import sys
import os

# Path setup
script_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(script_dir)))
project_root = os.path.dirname(backend_dir)
sys.path.insert(0, project_root)

from backend.app.utils.database import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()

# Check if columns exist
cursor.execute("PRAGMA table_info(papers)")
columns = [col['name'] for col in cursor.fetchall()]

print("=" * 60)
print("Papers Table Schema Check")
print("=" * 60)
print(f"Columns in papers table: {columns}")
print()

has_main_content = 'main_content' in columns
has_reference_section = 'reference_section' in columns
has_references_flag = 'has_references' in columns

print(f"Has main_content column:      {has_main_content}")
print(f"Has reference_section column: {has_reference_section}")
print(f"Has has_references column:    {has_references_flag}")
print()

if has_main_content:
    # Check how many papers have NULL vs populated main_content
    cursor.execute("SELECT COUNT(*) as total FROM papers")
    total = cursor.fetchone()['total']
    
    cursor.execute("SELECT COUNT(*) as with_data FROM papers WHERE main_content IS NOT NULL")
    with_data = cursor.fetchone()['with_data']
    
    cursor.execute("SELECT COUNT(*) as null_data FROM papers WHERE main_content IS NULL")
    null_data = cursor.fetchone()['null_data']
    
    cursor.execute("SELECT COUNT(*) as empty_data FROM papers WHERE main_content = ''")
    empty_data = cursor.fetchone()['empty_data']
    
    print("=" * 60)
    print("Data Status")
    print("=" * 60)
    print(f"Total papers:                {total}")
    print(f"Papers with main_content:    {with_data}")
    print(f"Papers with NULL:            {null_data}")
    print(f"Papers with empty string:    {empty_data}")
    print()
    
    if null_data > 0:
        print(f"✓ {null_data} papers need reference splitting!")
    elif with_data > 0:
        # Check if any actually have references
        cursor.execute("SELECT COUNT(*) as with_refs FROM papers WHERE has_references = 1")
        with_refs = cursor.fetchone()['with_refs']
        
        cursor.execute("SELECT COUNT(*) as without_refs FROM papers WHERE has_references = 0 OR has_references IS NULL")
        without_refs = cursor.fetchone()['without_refs']
        
        print("=" * 60)
        print("Reference Detection Status")
        print("=" * 60)
        print(f"Papers with references detected:     {with_refs}")
        print(f"Papers without references:           {without_refs}")
        print()
        
        if with_refs == 0:
            print("⚠️  WARNING: No references detected in any paper!")
            print("    This could mean:")
            print("    1. Your papers genuinely have no reference sections")
            print("    2. The reference detector isn't finding them")
            print("    3. The data was populated incorrectly")
            print()
            
            # Sample a few papers to check
            cursor.execute("SELECT id, title, LENGTH(content_text) as full_len, LENGTH(main_content) as main_len FROM papers LIMIT 5")
            samples = cursor.fetchall()
            
            print("Sample Papers (checking text lengths):")
            print("-" * 60)
            for s in samples:
                print(f"ID {s['id']}: {s['title'][:50]}")
                print(f"  Full text length: {s['full_len']} chars")
                print(f"  Main content length: {s['main_len']} chars")
                print(f"  Difference: {s['full_len'] - s['main_len']} chars")
                print()
    else:
        print("⚠️  All papers have empty main_content!")
else:
    print("⚠️  main_content column doesn't exist yet!")
    print("   Run: python backend/init_db.py")

conn.close()
