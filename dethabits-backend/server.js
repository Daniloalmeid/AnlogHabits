require('dotenv').config();
const express = require('express');
const { Connection, PublicKey, Keypair, Transaction, AccountLayout } = require('@solana/web3.js');
const { createTransferInstruction, getAssociatedTokenAddress, getAccount, createAssociatedTokenAccountInstruction } = require('@solana/spl-token');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Configuração com múltiplos nós RPC e retries
const RPC_NODES = [
    'https://api.mainnet-beta.solana.com',
    'https://rpc-mainnet.solana.com',
    'https://solana-api.projectserum.com',
    'https://api.mainnet-beta.solana.org' // Nó adicional
];
let connection = new Connection(RPC_NODES[0], {
    commitment: 'confirmed',
    httpHeaders: { 'Retry-After': '15' }
});

async function getConnectionWithRetry() {
    let attempt = 0;
    const maxAttempts = 5; // Aumentado para 5 tentativas
    while (attempt < maxAttempts) {
        for (const rpcUrl of RPC_NODES) {
            try {
                connection = new Connection(rpcUrl, { commitment: 'confirmed', httpHeaders: { 'Retry-After': '15' } });
                await connection.getAccountInfo(new PublicKey('11111111111111111111111111111111')); // Teste de conexão
                console.log(`Conexão bem-sucedida com o nó: ${rpcUrl}`);
                return connection;
            } catch (error) {
                console.error(`Tentativa no nó ${rpcUrl} falhou. Erro: ${error.message}`);
            }
        }
        attempt++;
        console.log(`Tentativa geral ${attempt} de ${maxAttempts} falhou. Aguardando 15 segundos...`);
        await new Promise(resolve => setTimeout(resolve, 15000)); // Aguarda 15 segundos
    }
    console.error('Falha ao conectar a todos os nós RPC após tentativas.');
    return null; // Retorna null se falhar, permitindo inicialização parcial
}

const TOKEN_MINT_ADDRESS = new PublicKey(process.env.TOKEN_MINT_ADDRESS || '2cgvTFEmGLfuGdKAqUpKUff4sTAEvtAbQtr6oqs5nozq');

// Verificar e parsear CENTRAL_WALLET_KEY do .env
let centralWalletKeypair;
try {
    const CENTRAL_WALLET_KEY = process.env.CENTRAL_WALLET_KEY;
    if (!CENTRAL_WALLET_KEY) {
        throw new Error('A variável CENTRAL_WALLET_KEY não está definida no .env.');
    }
    const parsedKey = JSON.parse(CENTRAL_WALLET_KEY);
    centralWalletKeypair = Keypair.fromSecretKey(new Uint8Array(parsedKey));
} catch (error) {
    console.error('Erro ao carregar a chave secreta da carteira central:', error.message);
    process.exit(1);
}

// Função para garantir a existência e validade da conta de token
async function ensureTokenAccount(ownerPubkey) {
    const tokenAccount = await getAssociatedTokenAddress(TOKEN_MINT_ADDRESS, ownerPubkey);
    console.log(`Verificando conta de token: ${tokenAccount.toBase58()}`);
    let accountInfo = await connection.getAccountInfo(tokenAccount);

    let attempt = 0;
    const maxAttempts = 5;
    while (!accountInfo && attempt < maxAttempts) {
        attempt++;
        console.log(`Tentativa ${attempt} de ${maxAttempts}. Conta não encontrada, criando...`);
        const transaction = new Transaction().add(
            createAssociatedTokenAccountInstruction(
                centralWalletKeypair.publicKey,
                tokenAccount,
                ownerPubkey,
                TOKEN_MINT_ADDRESS
            )
        );
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = centralWalletKeypair.publicKey;
        transaction.sign(centralWalletKeypair);
        const signature = await connection.sendRawTransaction(transaction.serialize());
        await connection.confirmTransaction(signature, 'confirmed');
        console.log(`Conta de token criada. Signature: ${signature}`);
        await new Promise(resolve => setTimeout(resolve, 10000)); // Aguarda 10 segundos
        accountInfo = await connection.getAccountInfo(tokenAccount);
    }

    if (!accountInfo) {
        console.error(`Falha ao criar a conta de token após ${maxAttempts} tentativas.`);
        throw new Error('Conta de token inválida ou não criada.');
    }

    try {
        await getAccount(connection, tokenAccount); // Verifica se é uma conta de token válida
        console.log(`Conta de token válida para ${ownerPubkey.toBase58()}: ${tokenAccount.toBase58()}`);
    } catch (error) {
        console.error(`Conta existe, mas não é válida. Erro: ${error.message}`);
        throw new Error('Conta de token inválida.');
    }

    return tokenAccount;
}

app.post('/withdraw', async (req, res) => {
    if (!connection) {
        return res.status(503).json({ error: 'Serviço indisponível. Tente novamente mais tarde.' });
    }

    try {
        const { destinationAddress, amount } = req.body;
        if (!destinationAddress || !amount) {
            return res.status(400).json({ error: 'Endereço de destino e quantia são obrigatórios.' });
        }

        const destinationPubkey = new PublicKey(destinationAddress);
        const amountLamports = Math.round(parseFloat(amount) * 1e6); // Ajustado para 6 decimais (confirme)

        // Garantir que a conta de token da carteira central exista
        const centralTokenAccount = await ensureTokenAccount(centralWalletKeypair.publicKey);
        const accountInfo = await connection.getAccountInfo(centralTokenAccount);

        if (!accountInfo) {
            return res.status(500).json({ error: 'Falha ao acessar a conta de token da carteira central após criação.' });
        }

        const data = AccountLayout.decode(accountInfo.data);
        const mintInfo = await connection.getAccountInfo(TOKEN_MINT_ADDRESS);
        const decimals = mintInfo ? mintInfo.data.readUInt8(44) : 6;
        const balance = data.amount.toString() / Math.pow(10, decimals);

        console.log(`Saldo atual: ${balance} DET`);
        if (balance < parseFloat(amount)) {
            return res.status(400).json({ error: `Saldo insuficiente na carteira central: ${balance.toFixed(5)} DET.` });
        }

        // Garantir que a conta de token do destinatário exista
        const destinationTokenAccount = await ensureTokenAccount(destinationPubkey);

        // Criar transação de transferência
        const transaction = new Transaction().add(
            createTransferInstruction(
                centralTokenAccount,
                destinationTokenAccount,
                centralWalletKeypair.publicKey,
                amountLamports,
                []
            )
        );

        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = centralWalletKeypair.publicKey;
        transaction.sign(centralWalletKeypair);

        const signature = await connection.sendRawTransaction(transaction.serialize());
        await connection.confirmTransaction(signature, 'confirmed');

        res.json({ signature, message: `Saque de ${amount} DET concluído.` });
    } catch (error) {
        console.error('Erro no saque:', error);
        res.status(500).json({ error: error.message || 'Erro ao processar saque.' });
    }
});

const PORT = process.env.PORT || 3000;

// Iniciar o servidor após verificar o saldo
async function startServer() {
    try {
        connection = await getConnectionWithRetry();
        if (!connection) {
            console.log('Conexão RPC indisponível. Servidor iniciado, mas endpoint desativado até reconexão.');
            app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT} (sem conexão RPC)`));
            return;
        }

        const centralTokenAccount = await ensureTokenAccount(centralWalletKeypair.publicKey);
        const accountInfo = await connection.getAccountInfo(centralTokenAccount);
        if (accountInfo && accountInfo.data) {
            const data = AccountLayout.decode(accountInfo.data);
            const mintInfo = await connection.getAccountInfo(TOKEN_MINT_ADDRESS);
            const decimals = mintInfo ? mintInfo.data.readUInt8(44) : 6;
            const balance = data.amount.toString() / Math.pow(10, decimals);
            console.log(`Saldo inicial da conta de token: ${balance} DET (decimais: ${decimals})`);
        } else {
            console.log('Conta de token criada, mas saldo não disponível. Verifique manualmente.');
        }
        app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
    } catch (error) {
        console.error('Falha ao iniciar o servidor:', error);
        process.exit(1);
    }
}

startServer();