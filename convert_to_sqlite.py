import sqlite3
import zipfile
import xml.etree.ElementTree as ET
import time
import os

excel_path = r"d:\Development\Full Stack\سس\نتيجة ثانوية عامة نظام حديث.xlsx"
db_path = r"d:\Development\Full Stack\سس\students.db"

def build_database():
    start_time = time.time()
    print("Starting Excel to SQLite conversion...")
    
    if os.path.exists(db_path):
        os.remove(db_path)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Optimization pragmas for fast insertion
    cursor.execute("PRAGMA synchronous = OFF;")
    cursor.execute("PRAGMA journal_mode = MEMORY;")

    cursor.execute("""
    CREATE TABLE students (
        seating_no INTEGER PRIMARY KEY,
        arabic_name TEXT,
        total_degree REAL,
        student_case_desc TEXT
    );
    """)

    print("Reading shared strings from Excel...")
    shared_strings = []
    with zipfile.ZipFile(excel_path, 'r') as z:
        if 'xl/sharedStrings.xml' in z.namelist():
            tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
            ns = {'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            for si in tree.findall('.//main:t', ns):
                shared_strings.append(si.text or '')
        
        print(f"Loaded {len(shared_strings)} shared strings in {time.time() - start_time:.2f}s")
        print("Parsing rows and populating SQLite database...")

        batch = []
        batch_size = 50000
        total_inserted = 0
        is_header = True

        context = ET.iterparse(z.open('xl/worksheets/sheet1.xml'), events=('end',))
        
        for event, elem in context:
            tag = elem.tag.split('}')[-1]
            if tag == 'row':
                cells = elem.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c')
                row_vals = []
                for c in cells:
                    v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                    val = ''
                    if v is not None:
                        val = v.text or ''
                        if c.attrib.get('t') == 's' and val.isdigit():
                            idx = int(val)
                            val = shared_strings[idx] if idx < len(shared_strings) else val
                    row_vals.append(val)
                
                elem.clear()

                if is_header:
                    is_header = False
                    continue

                if len(row_vals) >= 4:
                    try:
                        seat_no = int(row_vals[0].strip()) if row_vals[0].strip() else None
                        name = row_vals[1].strip()
                        degree = float(row_vals[2].strip()) if row_vals[2].strip() else 0.0
                        status = row_vals[3].strip()

                        if seat_no is not None:
                            batch.append((seat_no, name, degree, status))
                    except Exception:
                        pass

                if len(batch) >= batch_size:
                    cursor.executemany(
                        "INSERT OR REPLACE INTO students (seating_no, arabic_name, total_degree, student_case_desc) VALUES (?, ?, ?, ?)",
                        batch
                    )
                    conn.commit()
                    total_inserted += len(batch)
                    print(f"Inserted {total_inserted} records...")
                    batch = []

        if batch:
            cursor.executemany(
                "INSERT OR REPLACE INTO students (seating_no, arabic_name, total_degree, student_case_desc) VALUES (?, ?, ?, ?)",
                batch
            )
            conn.commit()
            total_inserted += len(batch)

    print(f"Total inserted: {total_inserted} rows.")
    
    print("Creating index on arabic_name...")
    idx_start = time.time()
    cursor.execute("CREATE INDEX idx_arabic_name ON students (arabic_name);")
    conn.commit()
    print(f"Index created in {time.time() - idx_start:.2f}s")

    # Restore pragmas
    cursor.execute("PRAGMA synchronous = NORMAL;")
    cursor.execute("PRAGMA journal_mode = WAL;")

    conn.close()
    print(f"Done! Total conversion time: {time.time() - start_time:.2f} seconds.")

if __name__ == "__main__":
    build_database()
