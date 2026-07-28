import http.server
import socketserver
import sqlite3
import json
import os
import gzip
import shutil
import urllib.parse
import sys
import math

# Force UTF-8 stdout/stderr encoding on Windows
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

PORT = 3000
DB_PATH = os.path.join(os.path.dirname(__file__), 'students.db')
DB_GZ_PATH = os.path.join(os.path.dirname(__file__), 'students.db.gz')
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), 'public')

def get_db():
    if not os.path.exists(DB_PATH) and os.path.exists(DB_GZ_PATH):
        print("Extracting students.db.gz...")
        with gzip.open(DB_GZ_PATH, 'rb') as f_in:
            with open(DB_PATH, 'wb') as f_out:
                shutil.copyfileobj(f_in, f_out)
        print("Extraction complete.")
        
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

class ThanaweyaSearchHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query_params = urllib.parse.parse_qs(parsed.query)

        if path == '/api/search':
            self.handle_search_api(query_params)
        elif path == '/api/stats':
            self.handle_stats_api()
        else:
            # Serve static files from public directory
            super().do_GET()

    def handle_search_api(self, params):
        q = params.get('q', [''])[0].strip()
        search_type = params.get('type', ['seat'])[0]
        
        try:
            page = max(1, int(params.get('page', [1])[0]))
        except ValueError:
            page = 1

        try:
            limit = min(100, max(1, int(params.get('limit', [20])[0])))
        except ValueError:
            limit = 20

        offset = (page - 1) * limit

        if not q:
            self.send_json_response({"success": True, "data": [], "total": 0, "page": page, "totalPages": 0})
            return

        conn = get_db()
        cursor = conn.cursor()

        try:
            if search_type == 'seat':
                try:
                    seat_num = int(q)
                except ValueError:
                    seat_num = -1

                count_sql = "SELECT COUNT(*) as total FROM students WHERE seating_no = ? OR seating_no LIKE ?"
                cursor.execute(count_sql, (seat_num, f"{q}%"))
                total = cursor.fetchone()['total']

                data_sql = """
                    SELECT seating_no, arabic_name, total_degree, student_case_desc
                    FROM students
                    WHERE seating_no = ? OR seating_no LIKE ?
                    ORDER BY CASE WHEN seating_no = ? THEN 0 ELSE 1 END, seating_no ASC
                    LIMIT ? OFFSET ?
                """
                cursor.execute(data_sql, (seat_num, f"{q}%", seat_num, limit, offset))
                rows = [dict(row) for row in cursor.fetchall()]

            else: # Search by name
                words = [w for w in q.split() if w]
                if not words:
                    self.send_json_response({"success": True, "data": [], "total": 0, "page": page, "totalPages": 0})
                    conn.close()
                    return

                conditions = " AND ".join(["arabic_name LIKE ?" for _ in words])
                sql_params = [f"%{w}%" for w in words]

                count_sql = f"SELECT COUNT(*) as total FROM students WHERE {conditions}"
                cursor.execute(count_sql, sql_params)
                total = cursor.fetchone()['total']

                data_sql = f"""
                    SELECT seating_no, arabic_name, total_degree, student_case_desc
                    FROM students
                    WHERE {conditions}
                    ORDER BY seating_no ASC
                    LIMIT ? OFFSET ?
                """
                cursor.execute(data_sql, sql_params + [limit, offset])
                rows = [dict(row) for row in cursor.fetchall()]

            total_pages = math.ceil(total / limit) if total > 0 else 0

            self.send_json_response({
                "success": True,
                "data": rows,
                "total": total,
                "page": page,
                "totalPages": total_pages
            })

        except Exception as e:
            self.send_json_response({"success": False, "error": str(e)}, status=500)
        finally:
            conn.close()

    def handle_stats_api(self):
        conn = get_db()
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT COUNT(*) as totalCount, MAX(total_degree) as maxDegree, AVG(total_degree) as avgDegree FROM students")
            row = cursor.fetchone()
            self.send_json_response({
                "success": True,
                "stats": {
                    "totalStudents": row['totalCount'] or 0,
                    "maxDegree": row['maxDegree'] or 0,
                    "avgDegree": round(row['avgDegree'], 2) if row['avgDegree'] else 0
                }
            })
        except Exception as e:
            self.send_json_response({"success": False, "error": str(e)}, status=500)
        finally:
            conn.close()

    def send_json_response(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

if __name__ == '__main__':
    print(f"Server started on http://localhost:{PORT}")
    sys.stdout.flush()
    with socketserver.TCPServer(("", PORT), ThanaweyaSearchHandler) as httpd:
        httpd.serve_forever()
