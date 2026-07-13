from sqlalchemy import create_engine, MetaData
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from databases import Database
from dotenv import load_dotenv
import os

load_dotenv()

# Async URL for FastAPI (databases library)
DATABASE_URL = os.getenv("DATABASE_URL")

# Sync URL for SQLAlchemy table creation
SYNC_DATABASE_URL = os.getenv("SYNC_DATABASE_URL")

# Async database instance (used in route handlers)
database = Database(DATABASE_URL)

# Sync engine (used only to create tables on startup)
sync_engine = create_engine(SYNC_DATABASE_URL)

# Base class for all table models
Base = declarative_base()

metadata = MetaData()