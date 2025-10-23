/* global window, ApiPromise, WsProvider */

class AnlogHabitsApp {
    constructor() {
        console.log('Construindo AnlogHabitsApp...');
        this.wallet = null;
        this.api = null;
        this.userData = {
            totalBalance: 294,
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
            lotteryWinnings: 0
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
                    lotteryWinnings: parsedData.lotteryWinnings || 0
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

    getCurrentDate() {
        const now = new Date();
        return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
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
                reward: this.applyVipBonus(mission.reward),
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
                    <span class="mission-reward">+${mission.reward} DET</span>
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
                    <span class="mission-reward">+${mission.reward} DET</span>
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
        const mission = this.missions.find(m => m.id === missionId) || this.fixedMissions.find(m => m.id === missionId);
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

    submitMission() {
        if (!this.currentMission) {
            console.error('Nenhuma missão selecionada para envio');
            this.showToast('Erro: Nenhuma missão selecionada.', 'error');
            return;
        }
        console.log('Enviando missão:', this.currentMission.id);
        try {
            const reward = this.currentMission.reward;
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

            this.userData.completedMissions.push({ id: this.currentMission.id, completedAt: new Date().toISOString() });
            this.addTransaction('mission', `Missão Concluída: ${this.currentMission.title} (+${reward} DET: 80% Total, 10% Stake, 10% Gastos)`, reward);
            
            const missionIndex = this.missions.findIndex(m => m.id === this.currentMission.id);
            if (missionIndex !== -1) {
                this.missions[missionIndex].completed = true;
                this.userData.dailyMissions[missionIndex].completed = true;
            }

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
            // Verificar a presença da extensão Talisman
            const injected = window.injectedWeb3 || null;
            if (!injected || !injected.talisman) {
                throw new Error('Talisman não encontrado. Instale a extensão Talisman em talisman.xyz ou abra-a no navegador.');
            }

            // Solicitar autorização para a DApp
            const nameApp = 'AnlogHabits';
            const talisman = await injected.talisman.enable(nameApp);

            // Obter contas disponíveis
            const accounts = await talisman.accounts.get();
            console.log('Contas disponíveis:', accounts);
            if (accounts.length === 0) {
                throw new Error('Nenhuma conta encontrada na carteira Talisman. Configure uma conta na extensão.');
            }

            // Selecionar a primeira conta
            this.wallet = accounts[0].address;
            console.log('Carteira conectada com sucesso:', this.wallet);
            this.userData.walletAddress = this.wallet;

            // Tentar conectar ao nó da Analog Mainnet
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

            // Inicializar lotteryAttempts
            const today = this.getCurrentDate();
            if (!this.userData.lotteryAttempts || this.userData.lotteryAttempts.date !== today) {
                this.userData.lotteryAttempts = {
                    date: today,
                    attempts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 }
                };
            }

            this.showToast('Carteira Talisman conectada com sucesso!', 'success');

            // Prosseguir com a exibição da interface mesmo se a conexão ao nó falhar
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
                lotteryWinnings: 0
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
            throw error;
        }
    }

    updateStakeLockTimer() {
        const stakeTimeLeftElement = document.getElementById('stake-time-left');
        if (!stakeTimeLeftElement) {
            console.warn('Elemento stake-time-left não encontrado');
            return;
        }
        if (!this.userData.stakeLockEnd) {
            stakeTimeLeftElement.textContent = 'Nenhum stake bloqueado';
            return;
        }
        const now = new Date();
        const lockEnd = new Date(this.userData.stakeLockEnd);
        const diff = lockEnd - now;
        if (diff <= 0) {
            stakeTimeLeftElement.textContent = 'Desbloqueado';
        } else {
            const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
            stakeTimeLeftElement.textContent = `Bloqueado por mais ${days} dia${days > 1 ? 's' : ''}`;
        }
    }

    updateWalletDisplay() {
        if (!this.wallet) {
            console.log('Nenhuma carteira conectada, pulando atualização de display');
            return;
        }
        console.log('Atualizando display da carteira:', this.wallet);
        const navbar = document.getElementById('navbar');
        if (navbar) navbar.style.display = 'block';
        const walletAddressElement = document.getElementById('wallet-address');
        if (walletAddressElement) {
            walletAddressElement.textContent =
                `${this.wallet.substring(0, 4)}...${this.wallet.substring(this.wallet.length - 4)}`;
        }
        const walletAddressFullElement = document.getElementById('wallet-address-full');
        if (walletAddressFullElement) {
            walletAddressFullElement.textContent = this.wallet;
        }
    }

    async loadAllMissions() {
        console.log('Carregando missões do missions.json...');
        try {
            const response = await fetch('missions.json');
            if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
            const data = await response.json();
            const newFixedMissions = data.fixedMissions || [];
            const newDailyMissions = data.dailyMissions || [];

            this.detectFixedMissionChanges(newFixedMissions);

            this.allMissions = newDailyMissions;
            this.fixedMissions = newFixedMissions.map(mission => ({
                ...mission,
                completed: this.userData.completedMissions.some(cm => cm.id === mission.id)
            }));
            this.userData.fixedMissions = newFixedMissions;
            this.saveUserData();
            console.log('Missões diárias carregadas:', this.allMissions.length);
            console.log('Missões fixas carregadas:', this.fixedMissions.length);
        } catch (error) {
            console.error('Erro ao carregar missões:', error);
            this.showToast('Erro ao carregar missões. Usando lista padrão.', 'error');
            this.allMissions = [
                {
                    id: 'water_1',
                    title: 'Beber 1 Copo de Água',
                    description: 'Hidrate-se bebendo pelo menos um copo de água e comprove com uma foto.',
                    icon: '💧',
                    reward: 7,
                    completed: false
                },
                {
                    id: 'walk_1',
                    title: 'Caminhar por 5 Minutos',
                    description: 'Faça uma caminhada de pelo menos 5 minutos e registre o momento.',
                    icon: '🚶',
                    reward: 7,
                    completed: false
                },
                {
                    id: 'meditation_1',
                    title: 'Meditar por 3 Minutos',
                    description: 'Dedique 3 minutos para meditação e tire uma selfie relaxante.',
                    icon: '🧘',
                    reward: 7,
                    completed: false
                },
                {
                    id: 'nap_1',
                    title: 'Tirar uma Soneca de 15 Minutos',
                    description: 'Tire uma soneca de 15 minutos e comprove com uma foto do ambiente.',
                    icon: '😴',
                    reward: 7,
                    completed: false
                },
                {
                    id: 'stretch_1',
                    title: 'Alongar o Corpo por 2 Minutos',
                    description: 'Faça alongamentos por 2 minutos e envie uma foto ou vídeo.',
                    icon: '🤸',
                    reward: 7,
                    completed: false
                }
            ];
            this.fixedMissions = [];
            this.userData.fixedMissions = [];
            this.detectFixedMissionChanges(this.fixedMissions);
            this.saveUserData();
            console.log('Usando missões diárias padrão:', this.allMissions);
        }
    }

    detectFixedMissionChanges(newFixedMissions) {
        console.log('Detectando alterações nas missões fixas...');
        try {
            const oldFixedMissions = this.userData.fixedMissions || [];
            const newMissionIds = newFixedMissions.map(m => m.id);
            const oldMissionIds = oldFixedMissions.map(m => m.id);

            const changedMissions = oldMissionIds.filter(id => !newMissionIds.includes(id));
            if (changedMissions.length > 0) {
                console.log('Missões fixas alteradas ou removidas:', changedMissions);
                this.userData.completedMissions = this.userData.completedMissions.filter(
                    cm => !changedMissions.includes(cm.id)
                );
                this.showToast('Missões fixas alteradas detectadas. Status de conclusão resetado para as missões modificadas.', 'info');
            }

            newFixedMissions.forEach(newMission => {
                const oldMission = oldFixedMissions.find(m => m.id === newMission.id);
                if (oldMission) {
                    const hasChanged =
                        oldMission.title !== newMission.title ||
                        oldMission.description !== newMission.description ||
                        oldMission.reward !== newMission.reward ||
                        oldMission.icon !== newMission.icon;
                    if (hasChanged) {
                        console.log(`Missão fixa alterada: ${newMission.id}`);
                        this.userData.completedMissions = this.userData.completedMissions.filter(
                            cm => cm.id !== newMission.id
                        );
                        this.showToast(`Missão fixa "${newMission.title}" foi alterada e está disponível novamente!`, 'success');
                    }
                }
            });

            this.saveUserData();
        } catch (error) {
            console.error('Erro ao detectar alterações nas missões fixas:', error);
            this.showToast('Erro ao verificar alterações nas missões fixas.', 'error');
        }
    }

    applyVipBonus(reward) {
        const totalStaked = (this.userData.stakeBalance || 0) + (this.userData.voluntaryStakeBalance || 0);
        let bonus = 1;
        if (totalStaked >= 500 && totalStaked <= 4999) bonus = 1.05;
        else if (totalStaked >= 5000 && totalStaked <= 49999) bonus = 1.25;
        else if (totalStaked >= 50000 && totalStaked <= 100000) bonus = 1.5;
        else if (totalStaked >= 100000) bonus = 2;
        return Math.ceil(reward * bonus);
    }

    updateMissionProgress() {
        const completedCount = this.userData.completedMissions.filter(cm =>
            this.missions.some(m => m.id === cm.id)
        ).length;
        const progress = this.missions.length > 0 ? (completedCount / this.missions.length) * 100 : 0;
        const progressBar = document.getElementById('daily-progress');
        const completedMissions = document.getElementById('completed-missions');
        if (progressBar) progressBar.style.width = `${progress}%`;
        if (completedMissions) completedMissions.textContent = `${completedCount}/${this.missions.length}`;
    }

    navigateTo(page) {
        console.log('Navegando para página:', page);
        this.currentPage = page;
        const pages = document.querySelectorAll('.page');
        const navButtons = document.querySelectorAll('.nav-button');
        pages.forEach(p => p.classList.remove('active'));
        navButtons.forEach(btn => btn.classList.remove('active'));

        const targetPage = document.getElementById(`${page}-page`);
        const targetButton = document.querySelector(`.nav-button[data-page="${page}"]`);
        if (targetPage) targetPage.classList.add('active');
        if (targetButton) targetButton.classList.add('active');
        this.updateUI();
    }

    setupEventListeners() {
        console.log('Configurando listeners de eventos...');
        const connectWalletBtn = document.getElementById('connect-wallet-btn');
        if (connectWalletBtn) {
            connectWalletBtn.addEventListener('click', () => this.connectWallet());
        }

        const disconnectBtn = document.getElementById('disconnect-btn');
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', () => this.disconnectWallet());
        }

        const navButtons = document.querySelectorAll('.nav-button');
        navButtons.forEach(button => {
            button.addEventListener('click', () => {
                const page = button.getAttribute('data-page');
                this.navigateTo(page);
            });
        });

        const missionsGrid = document.getElementById('missions-grid');
        if (missionsGrid) {
            missionsGrid.addEventListener('click', (e) => {
                const missionButton = e.target.closest('.mission-button');
                if (missionButton) {
                    const missionId = missionButton.getAttribute('data-mission-id');
                    this.openMissionModal(missionId);
                }
            });
        }

        const fixedMissionsGrid = document.getElementById('fixed-missions-grid');
        if (fixedMissionsGrid) {
            fixedMissionsGrid.addEventListener('click', (e) => {
                const missionButton = e.target.closest('.mission-button');
                if (missionButton) {
                    const missionId = missionButton.getAttribute('data-mission-id');
                    this.openMissionModal(missionId);
                }
            });
        }

        const photoInput = document.getElementById('photo-input');
        if (photoInput) {
            photoInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const preview = document.getElementById('photo-preview');
                        if (preview) {
                            preview.innerHTML = `<img src="${event.target.result}" alt="Preview" style="max-width: 100%; max-height: 200px;">`;
                            const submitButton = document.getElementById('submit-mission-btn');
                            if (submitButton) submitButton.disabled = false;
                        }
                    };
                    reader.readAsDataURL(file);
                }
            });
        }

        const submitMissionBtn = document.getElementById('submit-mission-btn');
        if (submitMissionBtn) {
            submitMissionBtn.addEventListener('click', () => this.submitMission());
        }

        const closeModalBtn = document.getElementById('close-modal');
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => this.closeModal());
        }

        const withdrawBtn = document.getElementById('withdraw-btn');
        if (withdrawBtn) {
            withdrawBtn.addEventListener('click', () => {
                const amountInput = document.getElementById('withdraw-amount-input');
                const amount = parseFloat(amountInput.value);
                try {
                    this.withdraw(amount);
                } catch (error) {
                    this.showToast(error.message, 'error');
                }
            });
        }

        const stakeVoluntaryBtn = document.getElementById('stake-voluntary-btn');
        if (stakeVoluntaryBtn) {
            stakeVoluntaryBtn.addEventListener('click', () => {
                const amountInput = document.getElementById('stake-amount-input');
                const amount = parseFloat(amountInput.value);
                try {
                    this.stakeVoluntary(amount);
                } catch (error) {
                    this.showToast(error.message, 'error');
                }
            });
        }

        const unstakeVoluntaryBtn = document.getElementById('unstake-voluntary-btn');
        if (unstakeVoluntaryBtn) {
            unstakeVoluntaryBtn.addEventListener('click', () => {
                const amountInput = document.getElementById('unstake-amount-input');
                const amount = parseFloat(amountInput.value);
                try {
                    this.unstakeVoluntaryPartial(amount);
                } catch (error) {
                    this.showToast(error.message, 'error');
                }
            });
        }

        const withdrawMaxObligatoryBtn = document.getElementById('withdraw-max-obligatory-btn');
        if (withdrawMaxObligatoryBtn) {
            withdrawMaxObligatoryBtn.addEventListener('click', () => {
                try {
                    this.withdrawMaxObligatory();
                } catch (error) {
                    this.showToast(error.message, 'error');
                }
            });
        }

        const withdrawMaxVoluntaryBtn = document.getElementById('withdraw-max-voluntary-btn');
        if (withdrawMaxVoluntaryBtn) {
            withdrawMaxVoluntaryBtn.addEventListener('click', () => {
                try {
                    this.withdrawMaxVoluntary();
                } catch (error) {
                    this.showToast(error.message, 'error');
                }
            });
        }

        const transferLotteryBtn = document.getElementById('transfer-lottery-btn');
        if (transferLotteryBtn) {
            transferLotteryBtn.addEventListener('click', () => {
                const amountInput = document.getElementById('transfer-amount-input');
                const amount = parseFloat(amountInput.value);
                try {
                    this.transferLotteryWinningsToTotal(amount);
                } catch (error) {
                    this.showToast(error.message, 'error');
                }
            });
        }

        const closeLotteryModalBtn = document.getElementById('close-lottery-modal');
        if (closeLotteryModalBtn) {
            closeLotteryModalBtn.addEventListener('click', () => {
                const modal = document.getElementById('lottery-win-modal');
                if (modal) modal.classList.remove('active');
            });
        }

        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        const navLinks = document.querySelector('.nav-links');
        if (mobileMenuBtn && navLinks) {
            mobileMenuBtn.addEventListener('click', () => {
                navLinks.classList.toggle('active');
                mobileMenuBtn.classList.toggle('open');
            });
        }
    }

    withdraw(amount) {
        console.log('Tentando sacar:', amount);
        try {
            amount = parseFloat(amount.toFixed(5));
            if (isNaN(amount) || amount < 800) {
                throw new Error('O valor mínimo para saque é 800 DET.');
            }
            if ((this.userData.totalBalance || 0) < amount) {
                throw new Error(`Saldo insuficiente. Você tem ${(this.userData.totalBalance || 0).toFixed(5)} DET.`);
            }
            this.userData.totalBalance -= amount;
            this.addTransaction('withdraw', `Saque: ${amount.toFixed(5)} DET`, -amount);
            this.saveUserData();
            this.updateUI();
            console.log('Saque realizado:', amount);
            this.showToast(`Saque de ${amount.toFixed(5)} DET realizado com sucesso!`, 'success');
            return amount;
        } catch (error) {
            console.error('Erro ao sacar:', error);
            throw error;
        }
    }

    closeModal() {
        const modal = document.getElementById('photo-modal');
        const photoInput = document.getElementById('photo-input');
        const photoPreview = document.getElementById('photo-preview');
        const submitButton = document.getElementById('submit-mission-btn');
        if (modal) modal.classList.remove('active');
        if (photoInput) photoInput.value = '';
        if (photoPreview) photoPreview.innerHTML = '';
        if (submitButton) submitButton.disabled = true;
        this.currentMission = null;
    }

    addTransaction(type, description, amount) {
        console.log('Adicionando transação:', { type, description, amount });
        this.userData.transactions.unshift({
            type,
            description,
            amount,
            date: new Date().toISOString()
        });
        if (this.userData.transactions.length > 50) {
            this.userData.transactions = this.userData.transactions.slice(0, 50);
        }
        this.saveUserData();
    }

    updateUI() {
        console.log('Atualizando UI...');
        try {
            const totalBalanceElement = document.getElementById('total-balance');
            if (totalBalanceElement) {
                totalBalanceElement.textContent = (this.userData.totalBalance || 0).toFixed(5);
            }

            const stakeBalanceElement = document.getElementById('stake-balance');
            if (stakeBalanceElement) {
                stakeBalanceElement.textContent = (this.userData.stakeBalance || 0).toFixed(5);
            }

            const voluntaryStakeBalanceElement = document.getElementById('voluntary-stake-balance');
            if (voluntaryStakeBalanceElement) {
                voluntaryStakeBalanceElement.textContent = (this.userData.voluntaryStakeBalance || 0).toFixed(5);
            }

            const spendingBalanceElement = document.getElementById('spending-balance');
            if (spendingBalanceElement) {
                spendingBalanceElement.textContent = (this.userData.spendingBalance || 0).toFixed(5);
            }

            const shopBalanceElement = document.getElementById('shop-balance');
            if (shopBalanceElement) {
                shopBalanceElement.textContent = (this.userData.spendingBalance || 0).toFixed(5);
            }

            const lotteryWinningsElement = document.getElementById('lottery-winnings');
            if (lotteryWinningsElement) {
                lotteryWinningsElement.textContent = (this.userData.lotteryWinnings || 0).toFixed(5);
            }

            const withdrawBtn = document.getElementById('withdraw-btn');
            const withdrawInput = document.getElementById('withdraw-amount-input');
            if (withdrawBtn && withdrawInput) {
                withdrawBtn.disabled = !this.wallet || (this.userData.totalBalance || 0) < 800;
                withdrawInput.disabled = !this.wallet || (this.userData.totalBalance || 0) < 800;
            }

            const transferLotteryBtn = document.getElementById('transfer-lottery-btn');
            const transferInput = document.getElementById('transfer-amount-input');
            if (transferLotteryBtn && transferInput) {
                transferLotteryBtn.disabled = !this.wallet || (this.userData.lotteryWinnings || 0) <= 0 || (this.userData.spendingBalance || 0) <= 0;
                transferInput.disabled = !this.wallet || (this.userData.lotteryWinnings || 0) <= 0 || (this.userData.spendingBalance || 0) <= 0;
            }

            const stakeVoluntaryBtn = document.getElementById('stake-voluntary-btn');
            const stakeInput = document.getElementById('stake-amount-input');
            if (stakeVoluntaryBtn && stakeInput) {
                stakeVoluntaryBtn.disabled = !this.wallet || (this.userData.totalBalance || 0) <= 0;
                stakeInput.disabled = !this.wallet || (this.userData.totalBalance || 0) <= 0;
            }

            const unstakeVoluntaryBtn = document.getElementById('unstake-voluntary-btn');
            const unstakeInput = document.getElementById('unstake-amount-input');
            if (unstakeVoluntaryBtn && unstakeInput) {
                unstakeVoluntaryBtn.disabled = !this.wallet || (this.userData.voluntaryStakeBalance || 0) <= 0;
                unstakeInput.disabled = !this.wallet || (this.userData.voluntaryStakeBalance || 0) <= 0;
            }

            const withdrawMaxObligatoryBtn = document.getElementById('withdraw-max-obligatory-btn');
            if (withdrawMaxObligatoryBtn) {
                const now = new Date();
                const isLocked = this.userData.stakeLockEnd && new Date(this.userData.stakeLockEnd) > now;
                withdrawMaxObligatoryBtn.disabled = !this.wallet || (this.userData.stakeBalance || 0) <= 0 || isLocked;
            }

            const withdrawMaxVoluntaryBtn = document.getElementById('withdraw-max-voluntary-btn');
            if (withdrawMaxVoluntaryBtn) {
                withdrawMaxVoluntaryBtn.disabled = !this.wallet || (this.userData.voluntaryStakeBalance || 0) <= 0;
            }

            const transactionHistory = document.getElementById('transaction-history');
            if (transactionHistory) {
                transactionHistory.innerHTML = this.userData.transactions.map(t => `
                    <div class="history-item">
                        <span class="history-type">${t.type}</span>
                        <span class="history-description">${t.description}</span>
                        <span class="history-amount">${t.amount.toFixed(5)} DET</span>
                        <span class="history-date">${new Date(t.date).toLocaleString('pt-BR')}</span>
                    </div>
                `).join('');
            }

            this.updateMissionProgress();
            this.updateStakeLockTimer();
            this.updateYieldsUI();
        } catch (error) {
            console.error('Erro ao atualizar UI:', error);
            this.showToast('Erro ao atualizar a interface.', 'error');
        }
    }

    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            console.warn('Elemento toast-container não encontrado');
            return;
        }
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 500);
        }, 3000);
    }

    showLoading(message) {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.querySelector('p').textContent = message;
            loadingOverlay.classList.add('active');
        }
    }

    hideLoading() {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.classList.remove('active');
        }
    }

    saveUserData() {
        console.log('Salvando dados do usuário no localStorage...');
        try {
            localStorage.setItem(
                `anloghabits_${this.wallet || 'default'}`,
                JSON.stringify(this.userData)
            );
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
        }, 5 * 60 * 1000); // Backup a cada 5 minutos
    }
}

window.app = new AnlogHabitsApp();
window.app.init();