/* global window, ApiPromise, WsProvider */

class AnlogHabitsApp {
    constructor() {
        console.log('Construindo AnlogHabitsApp...');
        this.wallet = null;
        this.api = null;
        this.userData = {
            totalBalance: 294,
            anlogBalance: 1000,
            stakeBalance: 0,
            voluntaryStakeBalance: 0,
            fractionalYieldObligatory: 0,
            fractionalYieldVoluntary: 0,
            dailyYieldObligatoryAccumulated: 0,
            dailyYieldVoluntaryAccumulated: 0,
            lastYieldUpdateTime: Date.now(),
            lastYieldResetDate: new Date().toISOString(),
            spendingBalance: 0,
            completedMissions: [],
            transactions: [],
            lastMissionResetDate: Date.now(),
            dailyMissions: [],
            fixedMissions: [],
            stakeLockEnd: null,
            lotteryAttempts: null,
            walletAddress: null,
            lotteryWinnings: 0,
            researchLevels: { tenis: 1, tapete: 1 },
            researchRewards: { tenis: 0.5, tapete: 0.5 }
        };
        this.allMissions = [];
        this.fixedMissions = [];
        this.missions = [];
        this.currentPage = 'home';
        this.currentMission = null;
        this.nextMissionReset = null;
        this.minuteYieldRate = 300 / (365 * 24 * 60) / 100;
        this.secondYieldRate = this.minuteYieldRate / 60;
        this.yieldInterval = null;
        this.uiYieldInterval = null;
        this.rpcEndpoint = 'wss://timechain-rpc.analog.one';
    }

    async init() {
        console.log('Inicializando AnlogHabitsApp...');
        try {
            this.loadUserData();
            await this.loadAllMissions();
            this.selectDailyMissions();
            this.loadMissions();
            this.startMissionTimer();
            this.updateUI();
            this.setupEventListeners();
            this.startBackupInterval();
            try {
                console.log('Tentando reconexão automática com Talisman...');
                await this.connectWallet(true);
            } catch (error) {
                console.log('Talisman não disponível para reconexão automática:', error.message);
                this.showToast('Aguardando conexão manual com a carteira Talisman.', 'info');
            }
        } catch (error) {
            console.error('Erro durante inicialização:', error);
            this.showToast('Erro ao inicializar a aplicação. Verifique o console.', 'error');
        }
    }

    loadUserData() {
        console.log('Carregando dados do usuário do localStorage...');
        try {
            const savedData = localStorage.getItem(`anloghabits_${this.wallet || 'default'}`);
            if (savedData) {
                const parsedData = JSON.parse(savedData);
                const lastMissionResetDate = parsedData.lastMissionResetDate 
                    ? Number(parsedData.lastMissionResetDate) 
                    : Date.now();

                this.userData = {
                    ...this.userData,
                    ...parsedData,
                    totalBalance: parsedData.totalBalance !== undefined ? parsedData.totalBalance : 294,
                    anlogBalance: parsedData.anlogBalance !== undefined ? parsedData.anlogBalance : 1000,
                    stakeBalance: parsedData.stakeBalance || 0,
                    voluntaryStakeBalance: parsedData.voluntaryStakeBalance || 0,
                    fractionalYieldObligatory: parsedData.fractionalYieldObligatory || 0,
                    fractionalYieldVoluntary: parsedData.fractionalYieldVoluntary || 0,
                    dailyYieldObligatoryAccumulated: parsedData.dailyYieldObligatoryAccumulated || 0,
                    dailyYieldVoluntaryAccumulated: parsedData.dailyYieldVoluntaryAccumulated || 0,
                    lastYieldUpdateTime: parsedData.lastYieldUpdateTime || Date.now(),
                    lastYieldResetDate: parsedData.lastYieldResetDate || new Date().toISOString(),
                    spendingBalance: parsedData.spendingBalance || 0,
                    completedMissions: Array.isArray(parsedData.completedMissions) ? parsedData.completedMissions : [],
                    transactions: Array.isArray(parsedData.transactions) ? parsedData.transactions : [],
                    dailyMissions: Array.isArray(parsedData.dailyMissions) ? parsedData.dailyMissions : [],
                    fixedMissions: Array.isArray(parsedData.fixedMissions) ? parsedData.fixedMissions : [],
                    stakeLockEnd: parsedData.stakeLockEnd || null,
                    lastMissionResetDate: isNaN(lastMissionResetDate) ? Date.now() : lastMissionResetDate,
                    lotteryAttempts: parsedData.lotteryAttempts || null,
                    walletAddress: parsedData.walletAddress || null,
                    lotteryWinnings: parsedData.lotteryWinnings || 0,
                    researchLevels: parsedData.researchLevels || { tenis: 1, tapete: 1 },
                    researchRewards: parsedData.researchRewards || { tenis: 0.5, tapete: 0.5 }
                };
                if (!this.userData.lotteryAttempts) {
                    const today = this.getCurrentDate();
                    this.userData.lotteryAttempts = {
                        date: today,
                        attempts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 }
                    };
                }
                this.missions = this.userData.dailyMissions.map(mission => ({
                    ...mission,
                    completed: this.userData.completedMissions.some(cm => cm.id === mission.id)
                }));
                console.log('Dados do usuário carregados:', this.userData);
            } else {
                console.log('Nenhum dado encontrado no localStorage, usando valores padrão');
                const today = this.getCurrentDate();
                this.userData.lastMissionResetDate = Date.now();
                this.userData.dailyMissions = [];
                this.userData.lotteryAttempts = {
                    date: today,
                    attempts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 }
                };
                this.userData.lotteryWinnings = 0;
                this.missions = [];
            }
            this.saveUserData();
        } catch (error) {
            console.error('Erro ao carregar dados do usuário:', error);
            this.showToast('Erro ao carregar dados do usuário. Usando valores padrão.', 'error');
            const today = this.getCurrentDate();
            this.userData.lastMissionResetDate = Date.now();
            this.userData.dailyMissions = [];
            this.userData.lotteryAttempts = {
                date: today,
                attempts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 }
            };
            this.userData.lotteryWinnings = 0;
            this.missions = [];
            this.saveUserData();
        }
    }

    saveUserData() {
        console.log('Salvando dados do usuário no localStorage...');
        try {
            localStorage.setItem(`anloghabits_${this.wallet || 'default'}`, JSON.stringify(this.userData));
            console.log('Dados do usuário salvos com sucesso');
        } catch (error) {
            console.error('Erro ao salvar dados do usuário:', error);
            this.showToast('Erro ao salvar dados do usuário.', 'error');
        }
    }

    startBackupInterval() {
        console.log('Iniciando intervalo de backup...');
        setInterval(() => {
            if (this.wallet) {
                this.saveUserData();
                console.log('Backup automático realizado');
            }
        }, 5 * 60 * 1000);
    }

    showToast(message, type = 'info') {
        console.log(`Exibindo toast: ${message} [${type}]`);
        const toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            console.warn('Toast container não encontrado');
            return;
        }
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }

    showLoading(message) {
        console.log('Exibindo overlay de carregamento:', message);
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            const messageElement = loadingOverlay.querySelector('p');
            if (messageElement) messageElement.textContent = message;
            loadingOverlay.style.display = 'flex';
        }
    }

    hideLoading() {
        console.log('Ocultando overlay de carregamento');
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    }

    getCurrentDate() {
        const now = new Date();
        return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    }

    calculateResearchReward(level) {
        if (level <= 30) return 0.5 + (level - 1) * 0.0345; // 0.5 a 1.5 DET
        if (level <= 60) return 1.6 + (level - 31) * 0.0483; // 1.6 a 3 DET
        if (level <= 80) return 3.1 + (level - 61) * 0.095;  // 3.1 a 5 DET
        return 5.1 + (level - 81) * 0.2474; // 5.1 a 10 DET
    }

    calculateResearchCost(level) {
        return 300 + (level - 1) * 50; // Começa em 300 ANLOG, aumenta 50 por nível
    }

    upgradeResearch(banner) {
        console.log(`Tentando subir nível do banner: ${banner}`);
        try {
            const currentLevel = this.userData.researchLevels[banner] || 1;
            if (currentLevel >= 100) {
                throw new Error(`O banner ${banner} já está no nível máximo (100).`);
            }
            const cost = this.calculateResearchCost(currentLevel);
            if ((this.userData.anlogBalance || 0) < cost) {
                throw new Error(`Saldo insuficiente. Você tem ${(this.userData.anlogBalance || 0).toFixed(2)} ANLOG, mas o custo é ${cost} ANLOG.`);
            }
            this.userData.anlogBalance -= cost;
            this.userData.researchLevels[banner] = currentLevel + 1;
            this.userData.researchRewards[banner] = this.calculateResearchReward(currentLevel + 1);
            this.addTransaction('research', `Upgrade ${banner} para nível ${currentLevel + 1}: -${cost} ANLOG`, -cost);
            this.saveUserData();
            this.updateResearchUI();
            this.showToast(`Banner ${banner} subiu para o nível ${currentLevel + 1}!`, 'success');
        } catch (error) {
            console.error(`Erro ao subir nível do banner ${banner}:`, error);
            this.showToast(error.message, 'error');
        }
    }

    testMission(banner) {
        console.log(`Testando missão para o banner: ${banner}`);
        try {
            const mission = {
                tenis: {
                    id: 'walk_test',
                    title: 'Teste de Caminhada',
                    description: 'Caminhe por 1 minuto para testar o bônus de Tênis.',
                    icon: '🚶',
                    reward: 1 + (this.userData.researchRewards.tenis || 0.5),
                    category: 'movimento'
                },
                tapete: {
                    id: 'meditation_test',
                    title: 'Teste de Meditação',
                    description: 'Medite por 1 minuto para testar o bônus de Tapete.',
                    icon: '🧘',
                    reward: 1 + (this.userData.researchRewards.tapete || 0.5),
                    category: 'relaxamento'
                }
            }[banner];
            if (!mission) {
                throw new Error('Banner inválido para teste de missão.');
            }
            this.currentMission = mission;
            this.openMissionModal(mission.id);
            this.showToast(`Testando missão: ${mission.title}`, 'info');
        } catch (error) {
            console.error(`Erro ao testar missão do banner ${banner}:`, error);
            this.showToast(error.message, 'error');
        }
    }

    async loadAllMissions() {
        console.log('Carregando todas as missões...');
        try {
            const response = await fetch('missions.json');
            if (!response.ok) {
                throw new Error(`Erro ao carregar missões: ${response.statusText}`);
            }
            const missionsData = await response.json();
            this.allMissions = missionsData.daily || [];
            this.fixedMissions = missionsData.fixed || [];
            this.userData.fixedMissions = this.fixedMissions;
            console.log('Missões carregadas:', this.allMissions.length, 'diárias,', this.fixedMissions.length, 'fixas');
        } catch (error) {
            console.error('Erro ao carregar missões:', error);
            this.showToast('Erro ao carregar missões. Algumas funcionalidades podem estar indisponíveis.', 'error');
        }
    }

    selectDailyMissions(forceReset = false) {
        console.log('Selecionando missões diárias...');
        const now = new Date();
        const brasiliaOffset = -3 * 60 * 60 * 1000;
        const nowBrasilia = new Date(now.getTime() + brasiliaOffset);
        const today21hBrasilia = new Date(nowBrasilia);
        today21hBrasilia.setHours(21, 0, 0, 0);
        if (nowBrasilia >= today21hBrasilia) {
            today21hBrasilia.setDate(today21hBrasilia.getDate() + 1);
        }
        const nextResetTime = today21hBrasilia.getTime() - brasiliaOffset;
        const timeSinceLastReset = now.getTime() - this.userData.lastMissionResetDate;

        console.log('lastMissionResetDate:', new Date(this.userData.lastMissionResetDate));
        console.log('Time since last reset:', timeSinceLastReset / (60 * 1000), 'minutes');
        console.log('forceReset:', forceReset, 'dailyMissions length:', this.userData.dailyMissions.length);
        console.log('Next reset (21h Brasília):', new Date(nextResetTime));

        const areMissionsValid = this.userData.dailyMissions.length > 0 &&
            this.userData.dailyMissions.every(mission =>
                mission.id && this.allMissions.some(am => am.id === mission.id)
            );

        if (forceReset || timeSinceLastReset >= (24 * 60 * 60 * 1000) || !areMissionsValid) {
            console.log('Resetando missões diárias');
            if (this.allMissions.length === 0) {
                console.warn('Nenhuma missão diária disponível em allMissions');
                this.showToast('Nenhuma missão diária disponível. Tente novamente mais tarde.', 'error');
                return;
            }
            this.userData.completedMissions = this.userData.completedMissions.filter(cm => 
                this.fixedMissions.some(fm => fm.id === cm.id)
            );
            const shuffledMissions = [...this.allMissions].sort(() => Math.random() - 0.5);
            this.missions = shuffledMissions.slice(0, 5).map(mission => ({
                ...mission,
                reward: this.applyVipBonus(mission.reward) + (
                    mission.category === 'movimento' ? (this.userData.researchRewards.tenis || 0.5) :
                    mission.category === 'relaxamento' ? (this.userData.researchRewards.tapete || 0.5) : 0
                ),
                completed: false
            }));
            this.userData.dailyMissions = this.missions;
            this.userData.lastMissionResetDate = Date.now();
            this.nextMissionReset = nextResetTime;
            this.userData.lotteryAttempts = {
                date: this.getCurrentDate(),
                attempts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 }
            };
            this.saveUserData();
            console.log('Novas missões diárias selecionadas:', this.missions);
            this.showToast('Novas missões diárias disponíveis!', 'success');
        } else {
            console.log('Carregando missões diárias existentes');
            this.missions = this.userData.dailyMissions.map(mission => ({
                ...mission,
                completed: this.userData.completedMissions.some(cm => cm.id === mission.id)
            }));
            this.nextMissionReset = nextResetTime;
        }
        console.log('Próximo reset:', new Date(this.nextMissionReset));
    }

    applyVipBonus(reward) {
        // Placeholder para lógica de bônus VIP, se aplicável
        return reward;
    }

    startMissionTimer() {
        console.log('Iniciando temporizador de missões');
        if (!this.nextMissionReset || isNaN(this.nextMissionReset)) {
            const now = new Date();
            const brasiliaOffset = -3 * 60 * 60 * 1000;
            const nowBrasilia = new Date(now.getTime() + brasiliaOffset);
            const nextReset = new Date(nowBrasilia);
            nextReset.setHours(21, 0, 0, 0);
            if (nowBrasilia >= nextReset) {
                nextReset.setDate(nextReset.getDate() + 1);
            }
            this.nextMissionReset = nextReset.getTime() - brasiliaOffset;
            if (isNaN(this.nextMissionReset)) {
                console.warn('nextMissionReset inválido, inicializando com novo valor');
                this.nextMissionReset = now.getTime() + 24 * 60 * 60 * 1000;
                this.userData.lastMissionResetDate = Date.now();
                this.saveUserData();
            }
        }

        const updateTimer = () => {
            const now = new Date();
            const brasiliaOffset = -3 * 60 * 60 * 1000;
            const nowBrasilia = new Date(now.getTime() + brasiliaOffset);
            const today21hBrasilia = new Date(nowBrasilia);
            today21hBrasilia.setHours(21, 0, 0, 0);
            if (nowBrasilia >= today21hBrasilia) {
                today21hBrasilia.setDate(today21hBrasilia.getDate() + 1);
            }
            this.nextMissionReset = today21hBrasilia.getTime() - brasiliaOffset;

            const diff = this.nextMissionReset - now.getTime();

            if (diff <= 0 || (now.getTime() - this.userData.lastMissionResetDate) >= (24 * 60 * 60 * 1000)) {
                console.log('Resetando missões diárias');
                this.selectDailyMissions(true);
                this.loadMissions();
                this.updateMissionProgress();
                this.userData.lastMissionResetDate = Date.now();
                this.saveUserData();
                this.showToast('Missões diárias resetadas com sucesso!', 'success');
                return;
            }

            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);
            const missionTimer = document.getElementById('mission-timer');
            if (missionTimer) {
                missionTimer.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            } else {
                console.warn('Elemento mission-timer não encontrado');
            }
        };

        updateTimer();
        setInterval(updateTimer, 1000);
    }

    loadMissions() {
        console.log('Carregando missões na UI...');
        const missionsGrid = document.getElementById('missions-grid');
        const fixedMissionsGrid = document.getElementById('fixed-missions-grid');
        if (!missionsGrid || !fixedMissionsGrid) {
            console.warn('Elementos missions-grid ou fixed-missions-grid não encontrados');
            this.showToast('Erro ao carregar elementos da UI.', 'error');
            return;
        }

        missionsGrid.innerHTML = '';
        this.missions.forEach(mission => {
            const isCompleted = this.userData.completedMissions.some(cm => cm.id === mission.id);
            const missionCard = document.createElement('div');
            missionCard.className = `mission-card ${isCompleted ? 'completed' : ''}`;
            missionCard.innerHTML = `
                <div class="mission-header">
                    <span class="mission-icon">${mission.icon || '🏆'}</span>
                    <span class="mission-reward">+${mission.reward.toFixed(2)} DET</span>
                </div>
                <h3 class="mission-title">${mission.title}</h3>
                <p class="mission-description">${mission.description}</p>
                ${mission.link ? `<a href="${mission.link}" class="mission-link" target="_blank">Acesse aqui</a>` : ''}
                <button class="mission-button ${isCompleted ? 'completed' : 'pending'}" data-mission-id="${mission.id}" ${isCompleted ? 'disabled' : ''}>
                    ${isCompleted ? 'Concluída' : 'Enviar Prova'}
                </button>
            `;
            missionsGrid.appendChild(missionCard);
        });

        fixedMissionsGrid.innerHTML = '';
        this.fixedMissions.forEach(mission => {
            const isCompleted = this.userData.completedMissions.some(cm => cm.id === mission.id);
            const missionCard = document.createElement('div');
            missionCard.className = `mission-card ${isCompleted ? 'completed' : ''}`;
            missionCard.innerHTML = `
                <div class="mission-header">
                    <span class="mission-icon">${mission.icon || '🏆'}</span>
                    <span class="mission-reward">+${mission.reward.toFixed(2)} DET</span>
                </div>
                <h3 class="mission-title">${mission.title}</h3>
                <p class="mission-description">${mission.description}</p>
                ${mission.link ? `<a href="${mission.link}" class="mission-link" target="_blank">Acesse aqui</a>` : ''}
                <button class="mission-button ${isCompleted ? 'completed' : 'pending'}" data-mission-id="${mission.id}" ${isCompleted ? 'disabled' : ''}>
                    ${isCompleted ? 'Concluída' : 'Enviar Prova'}
                </button>
            `;
            fixedMissionsGrid.appendChild(missionCard);
        });
    }

    openMissionModal(missionId) {
        console.log('Abrindo modal para missão:', missionId);
        const mission = this.missions.find(m => m.id === missionId) || 
                       this.fixedMissions.find(m => m.id === missionId) || 
                       (this.currentMission && this.currentMission.id === missionId ? this.currentMission : null);
        if (!mission) {
            console.error('Missão não encontrada:', missionId);
            this.showToast('Missão não encontrada.', 'error');
            return;
        }
        this.currentMission = { ...mission };
        const modal = document.getElementById('photo-modal');
        const modalTitle = document.getElementById('modal-mission-title');
        if (modal && modalTitle) {
            modalTitle.textContent = mission.title;
            modal.classList.add('active');
        } else {
            console.warn('Elementos photo-modal ou modal-mission-title não encontrados');
            this.showToast('Erro ao abrir modal de missão.', 'error');
        }
    }

    closeModal() {
        console.log('Fechando modal');
        const modal = document.getElementById('photo-modal');
        const photoInput = document.getElementById('photo-input');
        const photoPreview = document.getElementById('photo-preview');
        if (modal) modal.classList.remove('active');
        if (photoInput) photoInput.value = '';
        if (photoPreview) photoPreview.innerHTML = '';
        const submitBtn = document.getElementById('submit-mission-btn');
        if (submitBtn) submitBtn.disabled = true;
        this.currentMission = null;
    }

    submitMission() {
        if (!this.currentMission) {
            console.error('Nenhuma missão selecionada para envio');
            this.showToast('Erro: Nenhuma missão selecionada.', 'error');
            return;
        }
        console.log('Enviando missão:', this.currentMission.id);
        try {
            let reward = this.currentMission.reward;
            // Aplicar bônus de pesquisa
            if (this.currentMission.id.includes('walk') || this.currentMission.id === 'walk_test') {
                reward += this.userData.researchRewards.tenis || 0.5;
            } else if (this.currentMission.id.includes('meditation') || this.currentMission.id === 'meditation_test') {
                reward += this.userData.researchRewards.tapete || 0.5;
            }
            const totalBalanceReward = reward * 0.8;
            const stakeBalanceReward = reward * 0.1;
            const spendingBalanceReward = reward * 0.1;

            this.userData.totalBalance = (this.userData.totalBalance || 0) + totalBalanceReward;
            this.userData.stakeBalance = (this.userData.stakeBalance || 0) + stakeBalanceReward;
            this.userData.spendingBalance = (this.userData.spendingBalance || 0) + spendingBalanceReward;

            if (!this.userData.stakeLockEnd && stakeBalanceReward > 0) {
                const lockEnd = new Date();
                lockEnd.setDate(lockEnd.getDate() + 90);
                this.userData.stakeLockEnd = lockEnd.toISOString();
            }

            if (!this.currentMission.id.includes('test')) {
                this.userData.completedMissions.push({ id: this.currentMission.id, completedAt: new Date().toISOString() });
                const missionIndex = this.missions.findIndex(m => m.id === this.currentMission.id);
                if (missionIndex !== -1) {
                    this.missions[missionIndex].completed = true;
                    this.userData.dailyMissions[missionIndex].completed = true;
                }
            }

            this.addTransaction('mission', `Missão Concluída: ${this.currentMission.title} (+${reward.toFixed(5)} DET: 80% Total, 10% Stake, 10% Gastos)`, reward);
            this.saveUserData();
            this.loadMissions();
            this.updateMissionProgress();
            this.updateUI();
            this.closeModal();
            this.showToast(
                `Missão "${this.currentMission.title}" concluída! Você ganhou ${totalBalanceReward.toFixed(5)} DET no Saldo Total, ${stakeBalanceReward.toFixed(5)} DET no Stake Obrigatório e ${spendingBalanceReward.toFixed(5)} DET no Saldo de Gastos!`,
                'success'
            );
        } catch (error) {
            console.error('Erro ao enviar missão:', error);
            this.showToast('Erro ao enviar missão.', 'error');
        }
    }

    addTransaction(type, description, amount) {
        console.log('Adicionando transação:', { type, description, amount });
        this.userData.transactions.push({
            type,
            description,
            amount,
            timestamp: new Date().toISOString()
        });
        this.updateTransactionHistory();
    }

    updateTransactionHistory() {
        console.log('Atualizando histórico de transações');
        const historyContainer = document.getElementById('transaction-history');
        if (!historyContainer) {
            console.warn('Elemento transaction-history não encontrado');
            return;
        }
        historyContainer.innerHTML = '';
        const transactions = (this.userData.transactions || []).slice().reverse();
        transactions.forEach(tx => {
            const txElement = document.createElement('div');
            txElement.className = `transaction-item ${tx.amount >= 0 ? 'positive' : 'negative'}`;
            txElement.innerHTML = `
                <span class="tx-type">${tx.type}</span>
                <span class="tx-description">${tx.description}</span>
                <span class="tx-amount">${tx.amount >= 0 ? '+' : ''}${tx.amount.toFixed(5)} DET</span>
                <span class="tx-date">${new Date(tx.timestamp).toLocaleString()}</span>
            `;
            historyContainer.appendChild(txElement);
        });
    }

    transferLotteryWinningsToTotal(amount) {
        console.log('Transferindo ganhos de sorteios para Saldo Total...', { amount });
        try {
            amount = parseFloat(amount.toFixed(5));
            if (isNaN(amount) || amount <= 0) {
                throw new Error('Por favor, insira uma quantidade válida (positivo).');
            }
            if (amount > (this.userData.lotteryWinnings || 0)) {
                throw new Error(`Quantidade excede os ganhos de sorteios. Você tem ${(this.userData.lotteryWinnings || 0).toFixed(5)} DET em ganhos.`);
            }
            if (amount > (this.userData.spendingBalance || 0)) {
                throw new Error(`Saldo de Gastos insuficiente. Você tem ${(this.userData.spendingBalance || 0).toFixed(5)} DET, mas tentou transferir ${amount.toFixed(5)} DET.`);
            }
            this.userData.spendingBalance -= amount;
            this.userData.totalBalance = (this.userData.totalBalance || 0) + amount;
            this.userData.lotteryWinnings = (this.userData.lotteryWinnings || 0) - amount;
            this.addTransaction('transfer', `Transferência de Ganhos de Sorteios para Saldo Total: ${amount.toFixed(5)} DET`, amount);
            this.saveUserData();
            this.updateUI();
            this.showToast(`Transferência de ${amount.toFixed(5)} DET de ganhos de sorteios para Saldo Total realizada com sucesso!`, 'success');
            return amount;
        } catch (error) {
            console.error('Erro ao transferir ganhos de sorteios:', error);
            this.showToast(error.message, 'error');
            throw error;
        }
    }

    async connectWallet(onlyIfTrusted = false) {
        console.log(`Tentando conectar carteira Talisman (onlyIfTrusted: ${onlyIfTrusted})...`);
        this.showLoading('Conectando à carteira Talisman...');
        try {
            const injected = window.injectedWeb3 || null;
            if (!injected || !injected.talisman) {
                throw new Error('Talisman não encontrado. Instale a extensão Talisman em talisman.xyz ou abra-a no navegador.');
            }

            const nameApp = 'AnlogHabits';
            const talisman = await injected.talisman.enable(nameApp);

            const accounts = await talisman.accounts.get();
            console.log('Contas disponíveis:', accounts);
            if (accounts.length === 0) {
                throw new Error('Nenhuma conta encontrada na carteira Talisman. Configure uma conta na extensão.');
            }

            this.wallet = accounts[0].address;
            console.log('Carteira conectada com sucesso:', this.wallet);
            this.userData.walletAddress = this.wallet;

            if (typeof WsProvider === 'undefined' || typeof ApiPromise === 'undefined') {
                console.warn('Biblioteca @polkadot/api não carregada corretamente. Funcionalidades de blockchain limitadas.');
                this.showToast('Não foi possível conectar ao nó da blockchain. Algumas funcionalidades podem estar limitadas.', 'warning');
            } else {
                try {
                    const provider = new WsProvider(this.rpcEndpoint);
                    this.api = await ApiPromise.create({ provider });
                    console.log('Conexão com o nó da Analog Mainnet estabelecida.');
                } catch (apiError) {
                    console.error('Erro ao conectar ao nó da Analog:', apiError);
                    this.showToast('Não foi possível conectar ao nó da blockchain. Algumas funcionalidades podem estar limitadas.', 'warning');
                    this.api = null;
                }
            }

            const today = this.getCurrentDate();
            if (!this.userData.lotteryAttempts || this.userData.lotteryAttempts.date !== today) {
                this.userData.lotteryAttempts = {
                    date: today,
                    attempts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 }
                };
            }

            this.showToast('Carteira Talisman conectada com sucesso!', 'success');

            const homePage = document.getElementById('home-page');
            if (homePage) homePage.style.display = 'none';
            const navbar = document.getElementById('navbar');
            if (navbar) navbar.style.display = 'block';
            this.loadUserData();
            this.selectDailyMissions();
            this.loadMissions();
            this.navigateTo('missions');
            this.updateWalletDisplay();
            this.updateUI();
            this.initStaking();
        } catch (error) {
            console.error('Erro ao conectar carteira:', error);
            if (error.message.includes('rejected') || error.message.includes('User rejected')) {
                this.showToast('Você rejeitou a conexão com a carteira Talisman.', 'error');
            } else {
                this.showToast(
                    `Erro ao conectar a carteira: ${error.message}. Certifique-se de que a extensão Talisman está instalada e ativada.`,
                    'error'
                );
            }
        } finally {
            this.hideLoading();
        }
    }

    disconnectWallet() {
        console.log('Desconectando carteira...');
        try {
            if (this.api) {
                this.api.disconnect();
                console.log('Desconectado do nó da Analog');
                this.api = null;
            }
            this.saveUserData();
            this.wallet = null;
            this.userData = {
                totalBalance: 294,
                anlogBalance: 1000,
                stakeBalance: 0,
                voluntaryStakeBalance: 0,
                fractionalYieldObligatory: 0,
                fractionalYieldVoluntary: 0,
                dailyYieldObligatoryAccumulated: 0,
                dailyYieldVoluntaryAccumulated: 0,
                lastYieldUpdateTime: Date.now(),
                lastYieldResetDate: new Date().toISOString(),
                spendingBalance: 0,
                completedMissions: [],
                transactions: [],
                lastMissionResetDate: Date.now(),
                dailyMissions: [],
                fixedMissions: [],
                stakeLockEnd: null,
                lotteryAttempts: null,
                walletAddress: null,
                lotteryWinnings: 0,
                researchLevels: { tenis: 1, tapete: 1 },
                researchRewards: { tenis: 0.5, tapete: 0.5 }
            };
            this.missions = [];
            const homePage = document.getElementById('home-page');
            const navbar = document.getElementById('navbar');
            if (homePage) homePage.style.display = 'block';
            if (navbar) navbar.style.display = 'none';
            this.navigateTo('home');
            this.showToast('Carteira desconectada com sucesso!', 'success');
            this.updateUI();
        } catch (error) {
            console.error('Erro ao desconectar carteira:', error);
            this.showToast('Erro ao desconectar carteira.', 'error');
        }
    }

    initStaking() {
        console.log('Inicializando funcionalidades de staking...');
        try {
            this.updateYieldsSinceLastUpdate();
            if (this.yieldInterval) clearInterval(this.yieldInterval);
            if (this.uiYieldInterval) clearInterval(this.uiYieldInterval);
            this.yieldInterval = setInterval(() => this.updateYields(), 60000);
            this.uiYieldInterval = setInterval(() => this.updateYieldsUI(), 1000);
        } catch (error) {
            console.error('Erro ao inicializar staking:', error);
            this.showToast('Erro ao inicializar staking. Funcionalidades de stake podem não funcionar.', 'error');
        }
    }

    updateYieldsSinceLastUpdate() {
        console.log('Atualizando rendimentos desde a última atualização');
        try {
            if (!this.wallet) {
                console.warn('Carteira não conectada, pulando atualização de rendimentos');
                return;
            }
            const now = Date.now();
            const lastUpdate = this.userData.lastYieldUpdateTime || now;
            const minutesElapsed = (now - lastUpdate) / (1000 * 60);

            if (minutesElapsed > 0) {
                const obligatoryYield = (this.userData.stakeBalance || 0) * this.minuteYieldRate * minutesElapsed;
                const voluntaryYield = (this.userData.voluntaryStakeBalance || 0) * this.minuteYieldRate * minutesElapsed;

                this.userData.fractionalYieldObligatory = (this.userData.fractionalYieldObligatory || 0) + obligatoryYield;
                this.userData.fractionalYieldVoluntary = (this.userData.fractionalYieldVoluntary || 0) + voluntaryYield;

                const obligatoryWhole = Math.floor(this.userData.fractionalYieldObligatory);
                const voluntaryWhole = Math.floor(this.userData.fractionalYieldVoluntary);

                if (obligatoryWhole >= 1) {
                    this.userData.stakeBalance = (this.userData.stakeBalance || 0) + obligatoryWhole;
                    this.userData.fractionalYieldObligatory -= obligatoryWhole;
                    this.userData.dailyYieldObligatoryAccumulated = (this.userData.dailyYieldObligatoryAccumulated || 0) + obligatoryWhole;
                    this.addTransaction('yield', `Rendimento Obrigatório: +${obligatoryWhole.toFixed(5)} DET`, obligatoryWhole);
                }

                if (voluntaryWhole >= 1) {
                    this.userData.voluntaryStakeBalance = (this.userData.voluntaryStakeBalance || 0) + voluntaryWhole;
                    this.userData.fractionalYieldVoluntary -= voluntaryWhole;
                    this.userData.dailyYieldVoluntaryAccumulated = (this.userData.dailyYieldVoluntaryAccumulated || 0) + voluntaryWhole;
                    this.addTransaction('yield', `Rendimento Voluntário: +${voluntaryWhole.toFixed(5)} DET`, voluntaryWhole);
                }

                this.userData.lastYieldUpdateTime = now;
                this.saveUserData();
                console.log('Rendimentos pendentes atualizados:', { obligatoryYield, voluntaryYield });
            }
        } catch (error) {
            console.error('Erro ao atualizar rendimentos pendentes:', error);
            this.showToast('Erro ao atualizar rendimentos pendentes.', 'error');
        }
    }

    updateYields() {
        console.log('Atualizando rendimentos');
        try {
            if (!this.wallet) {
                console.warn('Carteira não conectada, pulando atualização de rendimentos');
                return;
            }
            const now = new Date();
            const today = now.toISOString().split('T')[0];

            if ((this.userData.lastYieldResetDate || '') !== today) {
                console.log('Novo dia detectado, transferindo rendimentos fracionários');
                this.transferFractionalYields();
                this.userData.lastYieldResetDate = today;
                this.showToast('Rendimentos fracionários transferidos para o próximo dia!', 'success');
            }

            const obligatoryYield = (this.userData.stakeBalance || 0) * this.minuteYieldRate;
            const voluntaryYield = (this.userData.voluntaryStakeBalance || 0) * this.minuteYieldRate;

            this.userData.fractionalYieldObligatory = (this.userData.fractionalYieldObligatory || 0) + obligatoryYield;
            this.userData.fractionalYieldVoluntary = (this.userData.fractionalYieldVoluntary || 0) + voluntaryYield;

            const obligatoryWhole = Math.floor(this.userData.fractionalYieldObligatory);
            const voluntaryWhole = Math.floor(this.userData.fractionalYieldVoluntary);

            if (obligatoryWhole >= 1) {
                this.userData.stakeBalance = (this.userData.stakeBalance || 0) + obligatoryWhole;
                this.userData.fractionalYieldObligatory -= obligatoryWhole;
                this.userData.dailyYieldObligatoryAccumulated = (this.userData.dailyYieldObligatoryAccumulated || 0) + obligatoryWhole;
                this.addTransaction('yield', `Rendimento Obrigatório: +${obligatoryWhole.toFixed(5)} DET`, obligatoryWhole);
                this.showToast(`Você ganhou ${obligatoryWhole.toFixed(5)} DET no stake obrigatório!`, 'success');
            }

            if (voluntaryWhole >= 1) {
                this.userData.voluntaryStakeBalance = (this.userData.voluntaryStakeBalance || 0) + voluntaryWhole;
                this.userData.fractionalYieldVoluntary -= voluntaryWhole;
                this.userData.dailyYieldVoluntaryAccumulated = (this.userData.dailyYieldVoluntaryAccumulated || 0) + voluntaryWhole;
                this.addTransaction('yield', `Rendimento Voluntário: +${voluntaryWhole.toFixed(5)} DET`, voluntaryWhole);
                this.showToast(`Você ganhou ${voluntaryWhole.toFixed(5)} DET no stake voluntário!`, 'success');
            }

            this.userData.lastYieldUpdateTime = Date.now();
            this.updateStakeLockTimer();
            this.saveUserData();
            this.updateUI();
            console.log('Rendimentos atualizados:', {
                obligatory: this.userData.dailyYieldObligatoryAccumulated,
                voluntary: this.userData.dailyYieldVoluntaryAccumulated
            });
        } catch (error) {
            console.error('Erro ao atualizar rendimentos:', error);
            this.showToast('Erro ao atualizar rendimentos.', 'error');
        }
    }

    updateYieldsUI() {
        console.log('Atualizando UI dos rendimentos em tempo real');
        try {
            if (!this.wallet) {
                console.warn('Carteira não conectada, pulando atualização da UI de rendimentos');
                return;
            }
            const obligatoryYield = (this.userData.stakeBalance || 0) * this.secondYieldRate;
            const voluntaryYield = (this.userData.voluntaryStakeBalance || 0) * this.secondYieldRate;

            const tempFractionalObligatory = (this.userData.fractionalYieldObligatory || 0) + obligatoryYield;
            const tempFractionalVoluntary = (this.userData.fractionalYieldVoluntary || 0) + voluntaryYield;

            const dailyYieldElement = document.getElementById('daily-yield');
            if (dailyYieldElement) {
                const totalObligatoryYield = ((this.userData.dailyYieldObligatoryAccumulated || 0) + tempFractionalObligatory).toFixed(5);
                dailyYieldElement.textContent = `+${totalObligatoryYield} DET`;
                dailyYieldElement.classList.add('yield-update');
                setTimeout(() => dailyYieldElement.classList.remove('yield-update'), 500);
            }

            const dailyYieldVoluntaryElement = document.getElementById('daily-yield-voluntary');
            if (dailyYieldVoluntaryElement) {
                const totalVoluntaryYield = ((this.userData.dailyYieldVoluntaryAccumulated || 0) + tempFractionalVoluntary).toFixed(5);
                dailyYieldVoluntaryElement.textContent = `+${totalVoluntaryYield} DET`;
                dailyYieldVoluntaryElement.classList.add('yield-update');
                setTimeout(() => dailyYieldVoluntaryElement.classList.remove('yield-update'), 500);
            }
        } catch (error) {
            console.error('Erro ao atualizar UI dos rendimentos:', error);
            this.showToast('Erro ao atualizar rendimentos na interface.', 'error');
        }
    }

    transferFractionalYields() {
        console.log('Transferindo rendimentos fracionários para saldos');
        try {
            const obligatoryYield = Math.floor(this.userData.fractionalYieldObligatory || 0);
            const voluntaryYield = Math.floor(this.userData.fractionalYieldVoluntary || 0);

            if (obligatoryYield >= 1) {
                this.userData.stakeBalance = (this.userData.stakeBalance || 0) + obligatoryYield;
                this.userData.fractionalYieldObligatory -= obligatoryYield;
                this.userData.dailyYieldObligatoryAccumulated = (this.userData.dailyYieldObligatoryAccumulated || 0) + obligatoryYield;
                this.addTransaction('yield', `Rendimento Obrigatório Acumulado: +${obligatoryYield.toFixed(5)} DET`, obligatoryYield);
            }

            if (voluntaryYield >= 1) {
                this.userData.voluntaryStakeBalance = (this.userData.voluntaryStakeBalance || 0) + voluntaryYield;
                this.userData.fractionalYieldVoluntary -= voluntaryYield;
                this.userData.dailyYieldVoluntaryAccumulated = (this.userData.dailyYieldVoluntaryAccumulated || 0) + voluntaryYield;
                this.addTransaction('yield', `Rendimento Voluntário Acumulado: +${voluntaryYield.toFixed(5)} DET`, voluntaryYield);
            }

            this.userData.fractionalYieldObligatory = (this.userData.fractionalYieldObligatory || 0) % 1;
            this.userData.fractionalYieldVoluntary = (this.userData.fractionalYieldVoluntary || 0) % 1;
            this.saveUserData();
        } catch (error) {
            console.error('Erro ao transferir rendimentos fracionários:', error);
            this.showToast('Erro ao transferir rendimentos fracionários.', 'error');
        }
    }

    stakeVoluntary(amount) {
        console.log('Tentando realizar stake voluntário:', amount);
        try {
            amount = parseFloat(amount.toFixed(5));
            if (isNaN(amount) || amount <= 0) {
                throw new Error('Por favor, insira uma quantidade válida (positivo).');
            }
            if (amount > 10000) {
                throw new Error('O stake voluntário não pode exceder 10.000 DET por transação.');
            }
            if ((this.userData.totalBalance || 0) < amount) {
                throw new Error(`Saldo insuficiente. Você tem ${(this.userData.totalBalance || 0).toFixed(5)} DET, mas tentou fazer stake de ${amount.toFixed(5)} DET.`);
            }
            this.userData.totalBalance -= amount;
            this.userData.voluntaryStakeBalance = (this.userData.voluntaryStakeBalance || 0) + amount;
            this.addTransaction('stake', `Stake Voluntário: ${amount.toFixed(5)} DET`, amount);
            this.saveUserData();
            this.updateUI();
            console.log('Stake voluntário realizado:', amount);
            this.showToast(`Stake voluntário de ${amount.toFixed(5)} DET realizado com sucesso!`, 'success');
            return amount;
        } catch (error) {
            console.error('Erro ao realizar stake voluntário:', error);
            this.showToast(error.message, 'error');
            throw error;
        }
    }

    unstakeVoluntaryPartial(amount) {
        console.log('Tentando retirar parcialmente do stake voluntário:', amount);
        try {
            amount = parseFloat(amount.toFixed(5));
            if (isNaN(amount) || amount <= 0) {
                throw new Error('Por favor, insira uma quantidade válida (positivo).');
            }
            if ((this.userData.voluntaryStakeBalance || 0) < amount) {
                throw new Error(`Quantidade insuficiente. Você tem ${(this.userData.voluntaryStakeBalance || 0).toFixed(5)} DET em stake voluntário, mas tentou retirar ${amount.toFixed(5)} DET.`);
            }
            const totalStake = this.userData.voluntaryStakeBalance || 0;
            const proportion = amount / totalStake;
            const yieldAmount = (this.userData.fractionalYieldVoluntary || 0) * proportion;

            this.userData.voluntaryStakeBalance -= amount;
            this.userData.fractionalYieldVoluntary -= yieldAmount;
            this.userData.totalBalance = (this.userData.totalBalance || 0) + amount + yieldAmount;
            this.addTransaction('unstake', `Retirada Parcial de Stake Voluntário: ${(amount + yieldAmount).toFixed(5)} DET`, amount + yieldAmount);
            this.saveUserData();
            this.updateUI();
            console.log('Retirada parcial do stake voluntário realizada:', amount + yieldAmount);
            this.showToast(`Retirada de ${(amount + yieldAmount).toFixed(5)} DET do stake voluntário realizada!`, 'success');
            return amount + yieldAmount;
        } catch (error) {
            console.error('Erro ao retirar parcialmente do stake voluntário:', error);
            this.showToast(error.message, 'error');
            throw error;
        }
    }

    withdrawMaxObligatory() {
        console.log('Tentando retirar máximo do stake obrigatório');
        try {
            const now = new Date();
            if (this.userData.stakeLockEnd && new Date(this.userData.stakeLockEnd) > now) {
                const remainingDays = Math.ceil((new Date(this.userData.stakeLockEnd) - now) / (1000 * 60 * 60 * 24));
                throw new Error(`O stake obrigatório está bloqueado por mais ${remainingDays} dias.`);
            }
            const amount = this.userData.stakeBalance || 0;
            if (amount <= 0) {
                throw new Error('Nenhum valor disponível em stake obrigatório para retirada.');
            }
            const yieldAmount = (this.userData.fractionalYieldObligatory || 0) + (this.userData.dailyYieldObligatoryAccumulated || 0);
            this.userData.stakeBalance = 0;
            this.userData.fractionalYieldObligatory = 0;
            this.userData.dailyYieldObligatoryAccumulated = 0;
            this.userData.stakeLockEnd = null;
            this.userData.totalBalance = (this.userData.totalBalance || 0) + amount + yieldAmount;
            this.addTransaction('unstake', `Retirada de Stake Obrigatório: ${(amount + yieldAmount).toFixed(5)} DET`, amount + yieldAmount);
            this.saveUserData();
            this.updateUI();
            console.log('Stake obrigatório retirado:', amount + yieldAmount);
            this.showToast(`Retirada de ${(amount + yieldAmount).toFixed(5)} DET do stake obrigatório realizada!`, 'success');
            return amount + yieldAmount;
        } catch (error) {
            console.error('Erro ao retirar stake obrigatório:', error);
            this.showToast(error.message, 'error');
            throw error;
        }
    }

    withdrawMaxVoluntary() {
        console.log('Tentando retirar máximo do stake voluntário');
        try {
            const amount = this.userData.voluntaryStakeBalance || 0;
            if (amount <= 0) {
                throw new Error('Nenhum valor disponível em stake voluntário para retirada.');
            }
            const yieldAmount = (this.userData.fractionalYieldVoluntary || 0) + (this.userData.dailyYieldVoluntaryAccumulated || 0);
            this.userData.voluntaryStakeBalance = 0;
            this.userData.fractionalYieldVoluntary = 0;
            this.userData.dailyYieldVoluntaryAccumulated = 0;
            this.userData.totalBalance = (this.userData.totalBalance || 0) + amount + yieldAmount;
            this.addTransaction('unstake', `Retirada Máxima de Stake Voluntário: ${(amount + yieldAmount).toFixed(5)} DET`, amount + yieldAmount);
            this.saveUserData();
            this.updateUI();
            console.log('Stake voluntário máximo retirado:', amount + yieldAmount);
            this.showToast(`Retirada de ${(amount + yieldAmount).toFixed(5)} DET do stake voluntário realizada!`, 'success');
            return amount + yieldAmount;
        } catch (error) {
            console.error('Erro ao retirar máximo do stake voluntário:', error);
            this.showToast(error.message, 'error');
            throw error;
        }
    }

    withdrawTotal(amount) {
        console.log('Tentando sacar do saldo total:', amount);
        try {
            amount = parseFloat(amount.toFixed(5));
            if (isNaN(amount) || amount < 800) {
                throw new Error('O valor mínimo para saque é 800 DET.');
            }
            if ((this.userData.totalBalance || 0) < amount) {
                throw new Error(`Saldo insuficiente. Você tem ${(this.userData.totalBalance || 0).toFixed(5)} DET, mas tentou sacar ${amount.toFixed(5)} DET.`);
            }
            this.userData.totalBalance -= amount;
            this.addTransaction('withdraw', `Saque do Saldo Total: -${amount.toFixed(5)} DET`, -amount);
            this.saveUserData();
            this.updateUI();
            console.log('Saque do saldo total realizado:', amount);
            this.showToast(`Saque de ${amount.toFixed(5)} DET realizado com sucesso!`, 'success');
            return amount;
        } catch (error) {
            console.error('Erro ao sacar do saldo total:', error);
            this.showToast(error.message, 'error');
            throw error;
        }
    }

    updateStakeLockTimer() {
        console.log('Atualizando temporizador de bloqueio de stake');
        try {
            const stakeTimeLeft = document.getElementById('stake-time-left');
            if (!stakeTimeLeft) {
                console.warn('Elemento stake-time-left não encontrado');
                return;
            }
            if (!this.userData.stakeLockEnd || !this.userData.stakeBalance || this.userData.stakeBalance <= 0) {
                stakeTimeLeft.textContent = 'Nenhum stake bloqueado';
                return;
            }
            const now = new Date();
            const lockEnd = new Date(this.userData.stakeLockEnd);
            const diff = lockEnd - now;
            if (diff <= 0) {
                stakeTimeLeft.textContent = 'Bloqueio expirado';
                this.userData.stakeLockEnd = null;
                this.saveUserData();
                return;
            }
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            stakeTimeLeft.textContent = `${days}d ${hours}h ${minutes}m`;
        } catch (error) {
            console.error('Erro ao atualizar temporizador de bloqueio:', error);
            this.showToast('Erro ao atualizar temporizador de bloqueio.', 'error');
        }
    }

    updateWalletDisplay() {
        console.log('Atualizando exibição da carteira');
        try {
            const walletAddress = document.getElementById('wallet-address');
            const walletAddressFull = document.getElementById('wallet-address-full');
            if (walletAddress && walletAddressFull && this.wallet) {
                const shortAddress = `${this.wallet.slice(0, 6)}...${this.wallet.slice(-4)}`;
                walletAddress.textContent = shortAddress;
                walletAddressFull.textContent = this.wallet;
            } else {
                if (walletAddress) walletAddress.textContent = '';
                if (walletAddressFull) walletAddressFull.textContent = '';
            }
        } catch (error) {
            console.error('Erro ao atualizar exibição da carteira:', error);
            this.showToast('Erro ao atualizar exibição da carteira.', 'error');
        }
    }

    updateMissionProgress() {
        console.log('Atualizando progresso das missões');
        try {
            const completedMissions = document.getElementById('completed-missions');
            const dailyProgress = document.getElementById('daily-progress');
            if (!completedMissions || !dailyProgress) {
                console.warn('Elementos completed-missions ou daily-progress não encontrados');
                return;
            }
            const completedCount = this.userData.completedMissions.filter(cm => 
                this.missions.some(m => m.id === cm.id)
            ).length;
            completedMissions.textContent = `${completedCount}/5`;
            dailyProgress.style.width = `${(completedCount / 5) * 100}%`;
        } catch (error) {
            console.error('Erro ao atualizar progresso das missões:', error);
            this.showToast('Erro ao atualizar progresso das missões.', 'error');
        }
    }

    updateResearchUI() {
        console.log('Atualizando UI da página de Pesquisas');
        try {
            const anlogBalance = document.getElementById('anlog-balance');
            if (anlogBalance) {
                anlogBalance.textContent = (this.userData.anlogBalance || 0).toFixed(2);
            }

            const highestLevel = Math.max(
                this.userData.researchLevels.tenis || 1,
                this.userData.researchLevels.tapete || 1
            );
            const researchTimer = document.getElementById('research-timer');
            if (researchTimer) {
                researchTimer.textContent = `Nível ${highestLevel}`;
            }

            ['tenis', 'tapete'].forEach(banner => {
                const level = this.userData.researchLevels[banner] || 1;
                const reward = this.userData.researchRewards[banner] || 0.5;
                const cost = this.calculateResearchCost(level);

                const levelElement = document.getElementById(`${banner}-level`);
                const levelDisplay = document.getElementById(`${banner}-level-display`);
                const rewardElement = document.getElementById(`${banner}-reward`);
                const costElement = document.getElementById(`${banner}-cost`);
                const progressElement = document.getElementById(`${banner}-progress`);

                if (levelElement) levelElement.textContent = level;
                if (levelDisplay) levelDisplay.textContent = level;
                if (rewardElement) rewardElement.textContent = reward.toFixed(2);
                if (costElement) costElement.textContent = cost;
                if (progressElement) progressElement.style.width = `${level}%`;
            });
        } catch (error) {
            console.error('Erro ao atualizar UI da página de Pesquisas:', error);
            this.showToast('Erro ao atualizar interface de Pesquisas.', 'error');
        }
    }

    navigateTo(page) {
        console.log(`Navegando para a página: ${page}`);
        try {
            this.currentPage = page;
            const pages = document.querySelectorAll('.page');
            const navButtons = document.querySelectorAll('.nav-button');
            pages.forEach(p => p.classList.remove('active'));
            navButtons.forEach(btn => btn.classList.remove('active'));

            const targetPage = document.getElementById(`${page}-page`);
            const targetButton = document.querySelector(`.nav-button[data-page="${page}"]`);
            if (targetPage) targetPage.classList.add('active');
            if (targetButton) targetButton.classList.add('active');

            if (page === 'missions') {
                this.loadMissions();
                this.updateMissionProgress();
            } else if (page === 'wallet') {
                this.updateTransactionHistory();
                this.updateStakeLockTimer();
            } else if (page === 'shop') {
                this.updateShopUI();
            } else if (page === 'research') {
                this.updateResearchUI();
            }
        } catch (error) {
            console.error('Erro ao navegar para a página:', error);
            this.showToast('Erro ao navegar para a página.', 'error');
        }
    }

    updateShopUI() {
        console.log('Atualizando UI da loja');
        try {
            const shopBalance = document.getElementById('shop-balance');
            if (shopBalance) {
                shopBalance.textContent = `${(this.userData.spendingBalance || 0).toFixed(5)} DET`;
            }
        } catch (error) {
            console.error('Erro ao atualizar UI da loja:', error);
            this.showToast('Erro ao atualizar interface da loja.', 'error');
        }
    }

    updateUI() {
        console.log('Atualizando UI completa');
        try {
            this.updateWalletDisplay();
            const totalBalance = document.getElementById('total-balance');
            const stakeBalance = document.getElementById('stake-balance');
            const voluntaryStakeBalance = document.getElementById('voluntary-stake-balance');
            const spendingBalance = document.getElementById('spending-balance');
            const lotteryWinnings = document.getElementById('lottery-winnings');
            const withdrawBtn = document.getElementById('withdraw-btn');
            const withdrawMaxObligatoryBtn = document.getElementById('withdraw-max-obligatory-btn');
            const withdrawMaxVoluntaryBtn = document.getElementById('withdraw-max-voluntary-btn');
            const transferLotteryBtn = document.getElementById('transfer-lottery-btn');

            if (totalBalance) totalBalance.textContent = (this.userData.totalBalance || 0).toFixed(5);
            if (stakeBalance) stakeBalance.textContent = (this.userData.stakeBalance || 0).toFixed(5);
            if (voluntaryStakeBalance) voluntaryStakeBalance.textContent = (this.userData.voluntaryStakeBalance || 0).toFixed(5);
            if (spendingBalance) spendingBalance.textContent = (this.userData.spendingBalance || 0).toFixed(5);
            if (lotteryWinnings) lotteryWinnings.textContent = (this.userData.lotteryWinnings || 0).toFixed(5);

            if (withdrawBtn) {
                withdrawBtn.disabled = (this.userData.totalBalance || 0) < 800 || !this.wallet;
            }
            if (withdrawMaxObligatoryBtn) {
                const now = new Date();
                withdrawMaxObligatoryBtn.disabled = !this.userData.stakeBalance || this.userData.stakeBalance <= 0 || 
                    (this.userData.stakeLockEnd && new Date(this.userData.stakeLockEnd) > now) || !this.wallet;
            }
            if (withdrawMaxVoluntaryBtn) {
                withdrawMaxVoluntaryBtn.disabled = !this.userData.voluntaryStakeBalance || this.userData.voluntaryStakeBalance <= 0 || !this.wallet;
            }
            if (transferLotteryBtn) {
                transferLotteryBtn.disabled = !this.userData.lotteryWinnings || this.userData.lotteryWinnings <= 0 || !this.wallet;
            }

            if (this.currentPage === 'missions') {
                this.loadMissions();
                this.updateMissionProgress();
            } else if (this.currentPage === 'wallet') {
                this.updateTransactionHistory();
                this.updateStakeLockTimer();
            } else if (this.currentPage === 'shop') {
                this.updateShopUI();
            } else if (this.currentPage === 'research') {
                this.updateResearchUI();
            }
        } catch (error) {
            console.error('Erro ao atualizar UI:', error);
            this.showToast('Erro ao atualizar interface.', 'error');
        }
    }

    setupEventListeners() {
        console.log('Configurando listeners de eventos');
        try {
            const connectWalletBtn = document.getElementById('connect-wallet-btn');
            const disconnectBtn = document.getElementById('disconnect-btn');
            const presaleBtn = document.getElementById('presale-btn');
            const navButtons = document.querySelectorAll('.nav-button');
            const mobileMenuBtn = document.getElementById('mobile-menu-btn');
            const closeModalBtn = document.getElementById('close-modal');
            const photoInput = document.getElementById('photo-input');
            const submitMissionBtn = document.getElementById('submit-mission-btn');
            const withdrawBtn = document.getElementById('withdraw-btn');
            const withdrawMaxObligatoryBtn = document.getElementById('withdraw-max-obligatory-btn');
            const stakeVoluntaryBtn = document.getElementById('stake-voluntary-btn');
            const unstakeVoluntaryBtn = document.getElementById('unstake-voluntary-btn');
            const withdrawMaxVoluntaryBtn = document.getElementById('withdraw-max-voluntary-btn');
            const transferLotteryBtn = document.getElementById('transfer-lottery-btn');
            const upgradeTenisBtn = document.getElementById('upgrade-tenis');
            const testTenisBtn = document.getElementById('test-tenis');
            const upgradeTapeteBtn = document.getElementById('upgrade-tapete');
            const testTapeteBtn = document.getElementById('test-tapete');

            if (connectWalletBtn) {
                connectWalletBtn.addEventListener('click', () => this.connectWallet());
            }
            if (disconnectBtn) {
                disconnectBtn.addEventListener('click', () => this.disconnectWallet());
            }
            if (presaleBtn) {
                presaleBtn.addEventListener('click', () => this.navigateTo('presale'));
            }
            if (navButtons) {
                navButtons.forEach(button => {
                    button.addEventListener('click', () => {
                        const page = button.getAttribute('data-page');
                        this.navigateTo(page);
                    });
                });
            }
            if (mobileMenuBtn) {
                mobileMenuBtn.addEventListener('click', () => {
                    const navLinks = document.querySelector('.nav-links');
                    if (navLinks) navLinks.classList.toggle('active');
                });
            }
            if (closeModalBtn) {
                closeModalBtn.addEventListener('click', () => this.closeModal());
            }
            if (photoInput) {
                photoInput.addEventListener('change', (event) => {
                    const file = event.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            const photoPreview = document.getElementById('photo-preview');
                            if (photoPreview) {
                                photoPreview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="max-width: 100%; max-height: 200px;">`;
                                if (submitMissionBtn) submitMissionBtn.disabled = false;
                            }
                        };
                        reader.readAsDataURL(file);
                    }
                });
            }
            if (submitMissionBtn) {
                submitMissionBtn.addEventListener('click', () => this.submitMission());
            }
            if (withdrawBtn) {
                withdrawBtn.addEventListener('click', () => {
                    const withdrawAmountInput = document.getElementById('withdraw-amount-input');
                    if (withdrawAmountInput) {
                        const amount = parseFloat(withdrawAmountInput.value);
                        try {
                            this.withdrawTotal(amount);
                            withdrawAmountInput.value = '';
                        } catch (error) {
                            console.error('Erro ao processar saque:', error);
                        }
                    }
                });
            }
            if (withdrawMaxObligatoryBtn) {
                withdrawMaxObligatoryBtn.addEventListener('click', () => {
                    try {
                        this.withdrawMaxObligatory();
                    } catch (error) {
                        console.error('Erro ao processar retirada máxima obrigatória:', error);
                    }
                });
            }
            if (stakeVoluntaryBtn) {
                stakeVoluntaryBtn.addEventListener('click', () => {
                    const stakeAmountInput = document.getElementById('stake-amount-input');
                    if (stakeAmountInput) {
                        const amount = parseFloat(stakeAmountInput.value);
                        try {
                            this.stakeVoluntary(amount);
                            stakeAmountInput.value = '';
                        } catch (error) {
                            console.error('Erro ao processar stake voluntário:', error);
                        }
                    }
                });
            }
            if (unstakeVoluntaryBtn) {
                unstakeVoluntaryBtn.addEventListener('click', () => {
                    const unstakeAmountInput = document.getElementById('unstake-amount-input');
                    if (unstakeAmountInput) {
                        const amount = parseFloat(unstakeAmountInput.value);
                        try {
                            this.unstakeVoluntaryPartial(amount);
                            unstakeAmountInput.value = '';
                        } catch (error) {
                            console.error('Erro ao processar retirada parcial do stake voluntário:', error);
                        }
                    }
                });
            }
            if (withdrawMaxVoluntaryBtn) {
                withdrawMaxVoluntaryBtn.addEventListener('click', () => {
                    try {
                        this.withdrawMaxVoluntary();
                    } catch (error) {
                        console.error('Erro ao processar retirada máxima voluntária:', error);
                    }
                });
            }
            if (transferLotteryBtn) {
                transferLotteryBtn.addEventListener('click', () => {
                    const transferAmountInput = document.getElementById('transfer-amount-input');
                    if (transferAmountInput) {
                        const amount = parseFloat(transferAmountInput.value);
                        try {
                            this.transferLotteryWinningsToTotal(amount);
                            transferAmountInput.value = '';
                        } catch (error) {
                            console.error('Erro ao processar transferência de ganhos:', error);
                        }
                    }
                });
            }
            if (upgradeTenisBtn) {
                upgradeTenisBtn.addEventListener('click', () => this.upgradeResearch('tenis'));
            }
            if (testTenisBtn) {
                testTenisBtn.addEventListener('click', () => this.testMission('tenis'));
            }
            if (upgradeTapeteBtn) {
                upgradeTapeteBtn.addEventListener('click', () => this.upgradeResearch('tapete'));
            }
            if (testTapeteBtn) {
                testTapeteBtn.addEventListener('click', () => this.testMission('tapete'));
            }

            document.addEventListener('click', (event) => {
                if (event.target.classList.contains('mission-button')) {
                    const missionId = event.target.getAttribute('data-mission-id');
                    this.openMissionModal(missionId);
                }
            });
        } catch (error) {
            console.error('Erro ao configurar listeners de eventos:', error);
            this.showToast('Erro ao configurar interações da interface.', 'error');
        }
    }

    async enterLottery(lotteryId) {
        console.log('Entrando no sorteio:', lotteryId);
        try {
            if (!window.lottery || typeof window.lottery.enterLottery !== 'function') {
                throw new Error('Funcionalidade de sorteio não disponível. Verifique se lottery.js está carregado.');
            }
            await window.lottery.enterLottery(lotteryId);
        } catch (error) {
            console.error('Erro ao entrar no sorteio:', error);
            this.showToast(error.message, 'error');
        }
    }
}

window.app = new AnlogHabitsApp();
window.app.init();