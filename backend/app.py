import os
import base64
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.argon2 import Argon2id
from cryptography.hazmat.primitives import hashes
from stegano import lsb
from PIL import Image
import io

# --- Flask App Setup ---
app = Flask(__name__)
# WARNING: For production, restrict the CORS origin to your actual frontend URL
CORS(app) 
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# --- Core Cryptographic Engine (Enhanced from previous example) ---
class TopGradeEncryptor:
    def __init__(self):
        # High-security parameters for Argon2id
        self.kdf_salt_length = 16
        self.argon_time_cost = 3      # Increased complexity
        self.argon_memory_cost = 1024 * 128  # 128 MB RAM cost
        self.argon_parallelism = 4    # Uses 4 CPU threads
        self.argon_hash_len = 32      # For AES-256

    def _derive_key(self, password: str, salt: bytes) -> bytes:
        """Derives a 32-byte key from a password using Argon2id."""
        kdf = Argon2id(
            salt=salt,
            length=self.argon_hash_len,
            time_cost=self.argon_time_cost,
            memory_cost=self.argon_memory_cost,
            parallelism=self.argon_parallelism,
            algorithm=hashes.SHA256(),
            type=Argon2id.types.ID
        )
        return kdf.derive(password.encode())

    def encrypt_data(self, plaintext: str, password: str) -> str:
        """Encrypts text using AES-256-GCM. Returns a transport-safe string."""
        salt = os.urandom(self.kdf_salt_length)
        nonce = os.urandom(12)  # GCM standard nonce size
        key = self._derive_key(password, salt)
        
        aesgcm = AESGCM(key)
        ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
        
        # Pack into a single payload: salt + nonce + ciphertext
        combined_data = salt + nonce + ciphertext
        return base64.urlsafe_b64encode(combined_data).decode('utf-8')

    def decrypt_data(self, encrypted_package: str, password: str) -> (str | None):
        """Decrypts the package and verifies integrity. Returns None on failure."""
        try:
            data = base64.urlsafe_b64decode(encrypted_package)
            salt, nonce, ciphertext = data[:16], data[16:28], data[28:]
            
            key = self._derive_key(password, salt)
            
            aesgcm = AESGCM(key)
            plaintext_bytes = aesgcm.decrypt(nonce, ciphertext, None)
            return plaintext_bytes.decode('utf-8')
        except Exception:
            # Generic failure prevents timing attacks or error-based analysis
            return None

# Instantiate the crypto engine
crypto_engine = TopGradeEncryptor()

# --- API Endpoints ---
@app.route('/encrypt', methods=['POST'])
def encrypt_and_hide():
    if 'image' not in request.files or 'message' not in request.form or 'password' not in request.form:
        return jsonify({"error": "Missing required fields"}), 400

    image_file = request.files['image']
    message = request.form['message']
    password = request.form['password']
    
    # Memory Hygiene: Minimize lifetime of sensitive data
    try:
        # 1. Encrypt the message
        encrypted_package = crypto_engine.encrypt_data(message, password)
        del message, password # Explicitly delete sensitive data after use

        # 2. Hide the encrypted data in the image
        img = Image.open(image_file.stream)
        # Use a unique identifier to ensure we don't overwrite other data
        secret_img = lsb.hide(img, "MSG_START" + encrypted_package + "MSG_END")
        
        # Save to a byte buffer to send back
        byte_io = io.BytesIO()
        secret_img.save(byte_io, 'PNG')
        byte_io.seek(0)

        return send_file(byte_io, mimetype='image/png', as_attachment=True, download_name='encoded_image.png')

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/decrypt', methods=['POST'])
def reveal_and_decrypt():
    if 'image' not in request.files or 'password' not in request.form:
        return jsonify({"error": "Missing image or password"}), 400

    image_file = request.files['image']
    password = request.form['password']

    try:
        # 1. Reveal the hidden data from the image
        img = Image.open(image_file.stream)
        hidden_data = lsb.reveal(img)
        
        # Check for our unique identifier
        if hidden_data and hidden_data.startswith("MSG_START") and hidden_data.endswith("MSG_END"):
             encrypted_package = hidden_data.removeprefix("MSG_START").removesuffix("MSG_END")
        else:
            return jsonify({"error": "No hidden message found"}), 400

        # 2. Decrypt the revealed data
        decrypted_message = crypto_engine.decrypt_data(encrypted_package, password)
        del password # Memory hygiene

        if decrypted_message is None:
            return jsonify({"error": "Decryption failed. Wrong password or corrupted data."}), 403
        else:
            return jsonify({"message": decrypted_message})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # For development only. Use a production WSGI server (like Gunicorn) for deployment.
    app.run(host='0.0.0.0', port=5000, debug=True)
