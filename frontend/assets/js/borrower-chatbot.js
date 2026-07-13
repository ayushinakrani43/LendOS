(function () {
    const API = window.API_BASE || 'http://localhost:8000';

    function getToken() {
        return localStorage.getItem('borrower_token');
    }
    function getBorrowerId() {
        return localStorage.getItem('borrower_id') || 'anonymous';
    }
    function storageKey() {
        return `lendos_chat_history_${getBorrowerId()}`;
    }

    function saveHistory() {
        try {
            localStorage.setItem(storageKey(), JSON.stringify(history));
        } catch (e) { /* storage full or unavailable — fail silently, chat still works this session */ }
    }
    function loadHistory() {
        try {
            const raw = localStorage.getItem(storageKey());
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }
    function clearHistory() {
        history = [];
        localStorage.removeItem(storageKey());
        renderEmptyState();
    }

    let history = [];   // [{role: 'user'|'assistant', content: str}]
    let isOpen = false;
    let isSending = false;

    const SUGGESTIONS = [
        "When is my next EMI due?",
        "How many EMIs do I have pending?",
        "Which NBFC is best for my credit score?",
    ];

    function el(id) { return document.getElementById(id); }

    function toggleChat() {
        isOpen = !isOpen;
        el('chatbotPanel').classList.toggle('open', isOpen);
        el('chatbotLauncher').classList.toggle('hidden', isOpen);
        if (isOpen) {
            el('chatbotLauncher').querySelector('.unread-dot')?.classList.remove('show');
            el('chatbotInput').focus();
        }
    }

    function closeChat() {
        isOpen = false;
        el('chatbotPanel').classList.remove('open');
        el('chatbotLauncher').classList.remove('hidden');
    }

    function renderEmptyState() {
        el('chatbotMessages').innerHTML = `
            <div class="chat-empty-state">
                <i class="ti ti-message-chatbot"></i>
                <p><strong>Hi! I'm your LendOS assistant.</strong></p>
                <p>Ask me about your EMIs, loan status, or which NBFC fits your credit score.</p>
                <div class="chat-suggestions">
                    ${SUGGESTIONS.map(s => `<button class="chat-suggestion-chip" onclick="window.__chatbotAsk('${s.replace(/'/g, "\\'")}')">${s}</button>`).join('')}
                </div>
            </div>
        `;
    }

    function appendMessage(role, text) {
        const wrap = el('chatbotMessages');
        // Remove empty-state suggestions once conversation starts
        const emptyState = wrap.querySelector('.chat-empty-state');
        if (emptyState) emptyState.remove();

        const div = document.createElement('div');
        div.className = `chat-msg ${role === 'user' ? 'user' : 'bot'}`;
        const bubbleContent = role === 'user' ? escapeHtml(text) : renderMarkdown(text);
        div.innerHTML = `
            <div class="chat-msg-avatar">${role === 'user' ? '<i class="ti ti-user"></i>' : '<i class="ti ti-robot"></i>'}</div>
            <div class="chat-bubble">${bubbleContent}</div>
        `;
        wrap.appendChild(div);
        wrap.scrollTop = wrap.scrollHeight;
        return div;
    }

    function renderMarkdown(raw) {
        let text = escapeHtml(raw);

        // Bold: **text**
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        const lines = text.split('\n');
        let html = '';
        let listBuffer = [];
        let listType = null; // 'ol' | 'ul'

        function flushList() {
            if (listBuffer.length) {
                html += `<${listType}>${listBuffer.map(li => `<li>${li}</li>`).join('')}</${listType}>`;
                listBuffer = [];
                listType = null;
            }
        }

        lines.forEach(line => {
            const numbered = line.match(/^\s*\d+[.)]\s+(.*)/);
            const bulleted = line.match(/^\s*[-*]\s+(.*)/);

            if (numbered) {
                if (listType !== 'ol') { flushList(); listType = 'ol'; }
                listBuffer.push(numbered[1]);
            } else if (bulleted) {
                if (listType !== 'ul') { flushList(); listType = 'ul'; }
                listBuffer.push(bulleted[1]);
            } else {
                flushList();
                if (line.trim() === '') {
                    html += '<br>';
                } else {
                    html += `<div>${line}</div>`;
                }
            }
        });
        flushList();

        return html;
    }

    function showTyping() {
        const wrap = el('chatbotMessages');
        const div = document.createElement('div');
        div.className = 'chat-msg bot';
        div.id = 'chatTypingIndicator';
        div.innerHTML = `
            <div class="chat-msg-avatar"><i class="ti ti-robot"></i></div>
            <div class="chat-bubble chat-typing"><span></span><span></span><span></span></div>
        `;
        wrap.appendChild(div);
        wrap.scrollTop = wrap.scrollHeight;
    }
    function hideTyping() {
        el('chatTypingIndicator')?.remove();
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    async function sendMessage(text) {
        if (!text || !text.trim() || isSending) return;
        text = text.trim();

        const token = getToken();
        if (!token) {
            appendMessage('bot', "Please log in to use the assistant.");
            return;
        }

        appendMessage('user', text);
        el('chatbotInput').value = '';
        autoGrow(el('chatbotInput'));
        history.push({ role: 'user', content: text });
        saveHistory();

        isSending = true;
        el('chatbotSend').disabled = true;
        showTyping();

        try {
            const res = await fetch(`${API}/api/borrower/chatbot`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ message: text, history: history.slice(0, -1) }),
            });

            hideTyping();

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                appendMessage('bot', err.detail || "Sorry, I couldn't process that right now. Please try again.");
                isSending = false;
                el('chatbotSend').disabled = false;
                return;
            }

            const data = await res.json();
            appendMessage('bot', data.reply);
            history.push({ role: 'assistant', content: data.reply });
            saveHistory();

            if (!isOpen) {
                el('chatbotLauncher').querySelector('.unread-dot')?.classList.add('show');
            }
        } catch (e) {
            hideTyping();
            appendMessage('bot', "Sorry, something went wrong reaching the assistant. Please try again.");
        }

        isSending = false;
        el('chatbotSend').disabled = false;
    }

    function autoGrow(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 90) + 'px';
    }

    window.__chatbotAsk = function (text) { sendMessage(text); };

    function injectWidget() {
        const launcher = document.createElement('button');
        launcher.id = 'chatbotLauncher';
        launcher.className = 'chatbot-launcher';
        launcher.setAttribute('aria-label', 'Open assistant');
        launcher.innerHTML = `<i class="ti ti-message-chatbot"></i><span class="unread-dot"></span>`;
        launcher.onclick = toggleChat;

        const panel = document.createElement('div');
        panel.id = 'chatbotPanel';
        panel.className = 'chatbot-panel';
        panel.innerHTML = `
            <div class="chatbot-header">
                <div class="chatbot-header-left">
                    <div class="chatbot-avatar"><i class="ti ti-robot"></i></div>
                    <div>
                        <div class="chatbot-title">LendOS Assistant</div>
                        <div class="chatbot-subtitle"><span class="chatbot-status-dot"></span> Online</div>
                    </div>
                </div>
                <div class="chatbot-header-actions">
                    <button class="chatbot-clear-btn" id="chatbotClearBtn" title="Clear conversation" aria-label="Clear chat"><i class="ti ti-trash"></i></button>
                    <button class="chatbot-close" id="chatbotCloseBtn" aria-label="Close"><i class="ti ti-x"></i></button>
                </div>
            </div>
            <div class="chatbot-messages" id="chatbotMessages"></div>
            <div class="chatbot-input-row">
                <textarea class="chatbot-input" id="chatbotInput" rows="1" placeholder="Ask about your EMIs, loan, or NBFCs…"></textarea>
                <button class="chatbot-send" id="chatbotSend" aria-label="Send"><i class="ti ti-send-2"></i></button>
            </div>
        `;

        document.body.appendChild(launcher);
        document.body.appendChild(panel);

        el('chatbotCloseBtn').onclick = closeChat;
        el('chatbotClearBtn').onclick = () => {
            if (confirm('Clear this conversation? This cannot be undone.')) clearHistory();
        };
        el('chatbotSend').onclick = () => sendMessage(el('chatbotInput').value);
        el('chatbotInput').addEventListener('input', () => autoGrow(el('chatbotInput')));
        el('chatbotInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(el('chatbotInput').value);
            }
        });

        // Restore any saved conversation for this borrower
        history = loadHistory();
        if (history.length) {
            el('chatbotMessages').innerHTML = '';
            history.forEach(m => appendMessage(m.role === 'user' ? 'user' : 'bot', m.content));
        } else {
            renderEmptyState();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectWidget);
    } else {
        injectWidget();
    }
})();