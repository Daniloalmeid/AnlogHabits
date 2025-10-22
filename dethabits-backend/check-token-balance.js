const { Connection, Keypair, PublicKey, AccountLayout, Transaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } = require('@solana/spl-token');
require('dotenv').config();

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const TOKEN_MINT_ADDRESS = new PublicKey(process.env.TOKEN_MINT_ADDRESS);
const CENTRAL_WALLET_KEY = JSON.parse(process.env.CENTRAL_WALLET_KEY);

async function checkBalance() {
    try {
        const centralPublicKey = Keypair.fromSecretKey(new Uint8Array(CENTRAL_WALLET_KEY)).publicKey;
        const associatedTokenAddress = await getAssociatedTokenAddress(TOKEN_MINT_ADDRESS, centralPublicKey);
        console.log(`Verificando conta de token em: ${associatedTokenAddress.toBase58()}`);

        let accountInfo = await connection.getAccountInfo(associatedTokenAddress);

        if (!accountInfo) {
            console.log('A conta de token não existe. Tentando criá-la...');
            const transaction = new Transaction().add(
                createAssociatedTokenAccountInstruction(
                    centralPublicKey,
                    associatedTokenAddress,
                    centralPublicKey,
                    TOKEN_MINT_ADDRESS
                )
            );
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = centralPublicKey;
            transaction.sign(Keypair.fromSecretKey(new Uint8Array(CENTRAL_WALLET_KEY)));
            const signature = await connection.sendRawTransaction(transaction.serialize());
            await connection.confirmTransaction(signature, 'confirmed');
            console.log(`Conta de token criada. Signature: ${signature}`);
            // Aguarda um momento e re-verifica
            await new Promise(resolve => setTimeout(resolve, 5000)); // Aguarda 5 segundos
            accountInfo = await connection.getAccountInfo(associatedTokenAddress);
            if (!accountInfo) {
                console.log('Falha ao criar a conta de token ou sincronização pendente.');
                return;
            }
        }

        const data = AccountLayout.decode(accountInfo.data);
        const mintInfo = await connection.getAccountInfo(TOKEN_MINT_ADDRESS);
        const decimals = mintInfo ? mintInfo.data.readUInt8(44) : 6;
        const amount = data.amount.toString() / Math.pow(10, decimals);
        console.log(`Endereço da conta de token: ${associatedTokenAddress.toBase58()}`);
        console.log(`Saldo da conta de token: ${amount} DET (decimais: ${decimals})`);
    } catch (error) {
        console.error('Erro ao verificar saldo:', error.message);
    }
}

checkBalance();