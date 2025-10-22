const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js');
const { createAssociatedTokenAccountInstruction, getAssociatedTokenAddress } = require('@solana/spl-token');
require('dotenv').config();

// Configuração
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const TOKEN_MINT_ADDRESS = new PublicKey(process.env.TOKEN_MINT_ADDRESS);

// Carrega a chave secreta do .env
const centralWalletKey = JSON.parse(process.env.CENTRAL_WALLET_KEY);
const centralWallet = Keypair.fromSecretKey(new Uint8Array(centralWalletKey));

async function createTokenAccount() {
    try {
        const associatedTokenAddress = await getAssociatedTokenAddress(
            TOKEN_MINT_ADDRESS,
            centralWallet.publicKey
        );

        // Verifica se a conta já existe
        const accountInfo = await connection.getAccountInfo(associatedTokenAddress);
        if (!accountInfo) {
            console.log(`Criando conta de token associada para ${centralWallet.publicKey.toBase58()}...`);
            const transaction = new Transaction().add(
                createAssociatedTokenAccountInstruction(
                    centralWallet.publicKey, // Pagador das taxas
                    associatedTokenAddress, // Endereço da conta de token
                    centralWallet.publicKey, // Proprietário da conta
                    TOKEN_MINT_ADDRESS // Mint do token
                )
            );

            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = centralWallet.publicKey;
            transaction.sign(centralWallet);

            const signature = await connection.sendRawTransaction(transaction.serialize());
            await connection.confirmTransaction(signature);
            console.log(`Conta de token criada com sucesso. Endereço: ${associatedTokenAddress.toBase58()}, Signature: ${signature}`);
        } else {
            console.log(`Conta de token já existe: ${associatedTokenAddress.toBase58()}`);
        }
    } catch (error) {
        console.error('Erro ao criar conta de token:', error.message);
    }
}

createTokenAccount();