from cryptography.fernet import Fernet
import os

def generate_key():
    key = Fernet.generate_key().decode()
    print(f"\nYour new ENCRYPTION_KEY is:\n\n{key}\n")
    
    env_path = os.path.join(os.getcwd(), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            content = f.read()
        
        if "ENCRYPTION_KEY" in content:
            print("WARNING: ENCRYPTION_KEY allows exists in .env. Please check it manually.")
        else:
            print(f"Appending to {env_path}...")
            with open(env_path, "a") as f:
                f.write(f"\n# Security\nENCRYPTION_KEY={key}\n")
            print("Done!")
    else:
        print(f"Could not find .env file at {env_path}")
        print("Please create one and add the key manually.")

if __name__ == "__main__":
    generate_key()
