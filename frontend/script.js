document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const API_BASE_URL = 'http://127.0.0.1:5000'; // Change to your backend URL in production
    const UNLOCK_PIN = '987654321'; // Secret PIN to unlock the app

    // --- DOM ELEMENTS ---
    const calculator = document.getElementById('calculator');
    const encryptor = document.getElementById('encryptor');
    const calcDisplay = document.getElementById('calc-display');
    
    // --- State Variables ---
    let currentInput = '0';
    let operator = null;
    let firstOperand = null;
    let shouldResetDisplay = false;

    // --- CALCULATOR LOGIC ---
    document.querySelector('.buttons').addEventListener('click', (event) => {
        const { target } = event;
        if (!target.matches('button')) return;

        const { value } = target.dataset;

        if (value.match(/[0-9.]/)) {
            handleNumber(value);
        } else if (value.match(/[/*\-+]/)) {
            handleOperator(value);
        } else if (value === '=') {
            handleEquals();
        } else if (value === 'clear') {
            resetCalculator();
        } else if (value === 'backspace') {
            handleBackspace();
        }
        updateDisplay();
    });

    function handleNumber(num) {
        if (currentInput === '0' || shouldResetDisplay) {
            currentInput = num;
            shouldResetDisplay = false;
        } else {
            currentInput += num;
        }
    }

    function handleOperator(op) {
        if (operator !== null) handleEquals();
        firstOperand = parseFloat(currentInput);
        operator = op;
        shouldResetDisplay = true;
    }

    function handleEquals() {
        // Plausible Deniability Check
        if (currentInput === UNLOCK_PIN && operator === null) {
            showEncryptor();
            return;
        }

        if (operator === null || shouldResetDisplay) return;
        const secondOperand = parseFloat(currentInput);
        currentInput = String(calculate(firstOperand, secondOperand, operator));
        operator = null;
        shouldResetDisplay = true;
    }
    
    function calculate(a, b, op) {
        if (op === '+') return a + b;
        if (op === '-') return a - b;
        if (op === '*') return a * b;
        if (op === '/' && b !== 0) return a / b;
        return 'Error'; // Division by zero
    }

    function resetCalculator() {
        currentInput = '0';
        operator = null;
        firstOperand = null;
    }
    
    function handleBackspace() {
        currentInput = currentInput.slice(0, -1) || '0';
    }


    function updateDisplay() {
        calcDisplay.textContent = currentInput;
    }

    // --- ENCRYPTOR LOGIC ---
    const statusMsg = document.getElementById('status-message');

    function showEncryptor() {
        calculator.classList.remove('active');
        encryptor.classList.add('active');
        resetCalculator();
        updateDisplay();
    }
    
    document.getElementById('back-to-calc').addEventListener('click', () => {
        encryptor.classList.remove('active');
        calculator.classList.add('active');
    });

    // Tab switching
    window.openTab = (evt, tabName) => {
        const tabcontent = document.getElementsByClassName("tab-content");
        for (let i = 0; i < tabcontent.length; i++) {
            tabcontent[i].style.display = "none";
        }
        const tablinks = document.getElementsByClassName("tab-link");
        for (let i = 0; i < tablinks.length; i++) {
            tablinks[i].className = tablinks[i].className.replace(" active", "");
        }
        document.getElementById(tabName).style.display = "block";
        evt.currentTarget.className += " active";
    };

    // Encrypt button handler
    document.getElementById('encrypt-btn').addEventListener('click', async () => {
        const message = document.getElementById('message').value;
        const password = document.getElementById('enc-password').value;
        const image = document.getElementById('enc-image-upload').files[0];

        if (!message || !password || !image) {
            statusMsg.textContent = 'All fields are required for encryption.';
            return;
        }

        const formData = new FormData();
        formData.append('message', message);
        formData.append('password', password);
        formData.append('image', image);
        
        statusMsg.textContent = 'Encrypting and hiding data...';
        
        try {
            const response = await fetch(`${API_BASE_URL}/encrypt`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Encryption failed.');
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'secret.png';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            statusMsg.textContent = 'Encrypted image downloaded successfully.';
            
        } catch (error) {
            statusMsg.textContent = `Error: ${error.message}`;
        }
    });

    // Decrypt button handler
    const decryptedTextElem = document.getElementById('decrypted-text');
    const copyBtn = document.getElementById('copy-btn');
    
    document.getElementById('decrypt-btn').addEventListener('click', async () => {
        const password = document.getElementById('dec-password').value;
        const image = document.getElementById('dec-image-upload').files[0];
        
        decryptedTextElem.textContent = '';
        copyBtn.classList.add('hidden');

        if (!password || !image) {
            statusMsg.textContent = 'Password and image are required for decryption.';
            return;
        }

        const formData = new FormData();
        formData.append('password', password);
        formData.append('image', image);
        
        statusMsg.textContent = 'Revealing and decrypting...';

        try {
            const response = await fetch(`${API_BASE_URL}/decrypt`, {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Decryption failed.');
            }
            
            decryptedTextElem.textContent = result.message;
            copyBtn.classList.remove('hidden');
            statusMsg.textContent = 'Decryption successful!';

        } catch (error) {
            statusMsg.textContent = `Error: ${error.message}`;
        }
    });

    // Clipboard clearing feature
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(decryptedTextElem.textContent).then(() => {
            statusMsg.textContent = 'Copied to clipboard! It will be cleared in 30 seconds.';
            
            // The memory hygiene part for the frontend
            setTimeout(() => {
                // This is a browser security feature; we can't truly "clear" the clipboard.
                // The best we can do is overwrite it.
                navigator.clipboard.writeText(' ').then(() => {
                     console.log('Clipboard overwritten.');
                });
            }, 30000); // 30 seconds
        });
    });
});
