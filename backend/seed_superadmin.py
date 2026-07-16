import asyncio
import bcrypt
from app.core.database import database

async def seed_superadmin():
    print("Connecting to database...")
    await database.connect()
    
    email = "lendos@gmail.com"
    
    # 1. Check if the superadmin already exists
    existing_admin = await database.fetch_one(
        "SELECT id FROM superadmins WHERE email = :email", 
        {"email": email}
    )
    
    if existing_admin:
        print(f"Superadmin '{email}' already exists. Skipping seed.")
    else:
        # 2. Hash the password dynamically
        plain_password = b"Lendos@123"
        hashed_password = bcrypt.hashpw(plain_password, bcrypt.gensalt()).decode('utf-8')
        
        # 3. Insert the record
        print("Inserting new superadmin...")
        await database.execute(
            """
            INSERT INTO superadmins (full_name, email, hashed_password)
            VALUES (:name, :email, :password)
            """,
            {
                "name": "Admin",
                "email": email,
                "password": hashed_password
            }
        )
        print("Success: Superadmin account seeded! You can now log in.")
        
    await database.disconnect()

if __name__ == "__main__":
    # Run the async seed function
    asyncio.run(seed_superadmin())