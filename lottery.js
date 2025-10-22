class LotterySystem {
    constructor(app) {
        this.app = app;
        this.lotteries = [
            { id: 1, name: "Baú Inicial", cost: 1, prizes: [1, 2, 3] },
            { id: 2, name: "Baú Simples", cost: 5, prizes: [2, 3, 4, 7, 9, 12] },
            { id: 3, name: "Baú de Bronze", cost: 10, prizes: [6, 8, 9, 12, 15, 20] },
            { id: 4, name: "Baú de Prata", cost: 20, prizes: [16, 18, 19, 22, 25, 30] },
            { id: 5, name: "Baú de Ouro", cost: 40, prizes: [36, 38, 39, 42, 45, 50] },
            { id: 6, name: "Baú de Platina", cost: 60, prizes: [56, 58, 59, 62, 65, 70] },
            { id: 7, name: "Baú Épico", cost: 80, prizes: [76, 78, 79, 82, 85, 90] },
            { id: 8, name: "Baú Mítico", cost: 120, prizes: [116, 118, 119, 122, 125, 130] },
            { id: 9, name: "Baú Supremo", cost: 250, prizes: [246, 248, 249, 252, 255, 260] },
            { id: 10, name: "Baú Lendário", cost: 500, prizes: [496, 498, 499, 502, 505, 510] }
        ];
        this.maxDailyAttempts = 7;
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const transferAmountInput = document.getElementById('transfer-amount-input');
        const transferBtn = document.getElementById('transfer-lottery-btn');

        if (transferAmountInput && transferBtn) {
            transferAmountInput.addEventListener('input', () => {
                const amount = parseFloat(transferAmountInput.value);
                const winnings = this.app.userData.lotteryWinnings || 0;
                transferBtn.disabled = !amount || amount <= 0 || amount > winnings || amount > (this.app.userData.spendingBalance || 0);
            });

            transferBtn.addEventListener('click', () => {
                const amount = parseFloat(transferAmountInput.value);
                if (amount && amount > 0) {
                    try {
                        this.app.transferLotteryWinningsToTotal(amount);
                        transferAmountInput.value = '';
                    } catch (error) {
                        this.app.showToast(error.message, 'error');
                    }
                }
            });
        } else {
            console.error('Elementos de transferência não encontrados');
            this.app.showToast('Erro: Elementos de transferência não encontrados.', 'error');
        }
    }

    getCurrentDate() {
        const now = new Date();
        return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    }

    resetDailyAttempts() {
        const today = this.getCurrentDate();
        if (this.app.userData.lastAttemptDate !== today) {
            this.app.userData.lotteryAttempts = {};
            this.app.userData.lastAttemptDate = today;
            this.app.saveUserData();
        }
    }

    createParticles() {
        const particleContainer = document.querySelector('.particle-container');
        if (!particleContainer) return;

        particleContainer.innerHTML = '';
        for (let i = 0; i < 20; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = `${Math.random() * 100}%`;
            particle.style.animationDelay = `${Math.random() * 1.5}s`;
            particle.style.background = ['#FFD700', '#FFA500', '#FF69B4', '#00CED1'][Math.floor(Math.random() * 4)];
            particleContainer.appendChild(particle);
        }
    }

    showLotteryWinModal(lotteryName, prize, cost) {
        const modal = document.getElementById('lottery-win-modal');
        const message = document.getElementById('lottery-win-message');
        const closeBtn = document.getElementById('close-lottery-modal');

        if (modal && message && closeBtn) {
            const net = prize - cost;
            let netMessage = '';
            let color = '';
            if (net > 0) {
                netMessage = `Você ganhou ${net} DET`;
                color = 'green';
            } else if (net < 0) {
                netMessage = `Você perdeu ${-net} DET`;
                color = 'red';
            } else {
                netMessage = 'Sem ganho ou perda';
                color = 'gray';
            }

            message.innerHTML = `Você abriu o ${lotteryName} e ganhou ${prize} DET!<br><span style="color: ${color};">${netMessage}</span>`;

            modal.classList.add('active');
            this.createParticles();

            closeBtn.addEventListener('click', () => {
                modal.classList.remove('active');
            }, { once: true });

            setTimeout(() => {
                modal.classList.remove('active');
            }, 5000);
        } else {
            console.error('Elementos do modal de vitória não encontrados');
            this.app.showToast(`Parabéns! Você ganhou ${prize} DET no ${lotteryName}!`, 'success');
        }
    }

    enterLottery(lotteryId) {
        console.log(`Tentando participar do sorteio ${lotteryId}...`);
        this.resetDailyAttempts();

        const lottery = this.lotteries.find(l => l.id === lotteryId);
        if (!lottery) {
            this.app.showToast('Sorteio inválido!', 'error');
            return;
        }

        const today = this.getCurrentDate();
        this.app.userData.lotteryAttempts = this.app.userData.lotteryAttempts || {};
        this.app.userData.lotteryAttempts[lotteryId] = this.app.userData.lotteryAttempts[lotteryId] || { date: today, count: 0 };

        if (this.app.userData.lotteryAttempts[lotteryId].date !== today) {
            this.app.userData.lotteryAttempts[lotteryId] = { date: today, count: 0 };
        }

        if (this.app.userData.lotteryAttempts[lotteryId].count >= this.maxDailyAttempts) {
            this.app.showToast(`Limite de ${this.maxDailyAttempts} tentativas diárias para ${lottery.name} atingido.`, 'error');
            return;
        }

        if ((this.app.userData.spendingBalance || 0) < lottery.cost) {
            this.app.showToast(`Saldo de gastos insuficiente para ${lottery.name}. Necessário: ${lottery.cost} DET`, 'error');
            return;
        }

        try {
            // Deduzir o custo do baú
            this.app.userData.spendingBalance -= lottery.cost;

            // Selecionar prêmio aleatório da lista
            const prize = lottery.prizes[Math.floor(Math.random() * lottery.prizes.length)];

            // Adicionar o prêmio ao spendingBalance
            this.app.userData.spendingBalance += prize;

            // Calcular net e ajustar lotteryWinnings
            const net = prize - lottery.cost;
            if (net > 0) {
                this.app.userData.lotteryWinnings = (this.app.userData.lotteryWinnings || 0) + net;
            } else {
                this.app.userData.lotteryWinnings = Math.max(0, (this.app.userData.lotteryWinnings || 0) + net);
            }

            // Incrementar tentativas
            this.app.userData.lotteryAttempts[lotteryId].count += 1;

            // Registrar transações separadas para custo e prêmio
            this.app.addTransaction('lottery', `Sorteio ${lottery.name}: Custo ${lottery.cost} DET`, -lottery.cost);
            this.app.addTransaction('lottery', `Sorteio ${lottery.name}: Prêmio ${prize} DET`, prize);

            this.app.saveUserData();
            this.app.updateUI();

            this.showLotteryWinModal(lottery.name, prize, lottery.cost);
            console.log(`Sorteio ${lottery.name} concluído: Custo ${lottery.cost} DET, Prêmio ${prize} DET, Resultado líquido: ${net} DET`);
        } catch (error) {
            console.error('Erro ao processar sorteio:', error);
            this.app.showToast('Erro ao processar o sorteio. Tente novamente.', 'error');
        }
    }
}

window.lottery = new LotterySystem(window.app);
export default LotterySystem;