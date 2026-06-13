"""Database migration runner."""

import os
import glob
from pathlib import Path
from sqlalchemy import text, create_engine
from app.core.config import DATABASE_URL

def run_migrations():
    """Execute all SQL migrations in order."""
    engine = create_engine(DATABASE_URL)
    migrations_dir = Path(__file__).parent.parent.parent / "migrations"

    # Get all SQL files sorted by name (assuming numeric prefix)
    migration_files = sorted(glob.glob(str(migrations_dir / "*.sql")))

    if not migration_files:
        print("No migrations found.")
        return

    with engine.connect() as conn:
        for migration_file in migration_files:
            filename = os.path.basename(migration_file)
            print(f"\nRunning migration: {filename}")

            try:
                with open(migration_file, "r") as f:
                    sql = f.read()
                    # Execute each statement
                    for statement in sql.split(";"):
                        statement = statement.strip()
                        if statement:
                            conn.execute(text(statement))
                conn.commit()
                print(f"  ✓ {filename} completed")
            except Exception as e:
                conn.rollback()
                print(f"  ✗ {filename} failed: {str(e)}")
                raise

if __name__ == "__main__":
    run_migrations()
    print("\n✅ All migrations completed!")
