const { Keypair } = require('@solana/web3.js');

const secretKey = new Uint8Array([
    58,90,128,88,70,47,18,3,20,72,55,176,7,198,166,60,32,254,104,30,37,233,114,244,111,113,232,147,31,178,57,186,30,128,50,134,70,137,202,201,67,65,119,150,216,95,250,155,109,44,139,47,241,207,182,6,121,29,180,96,191,201,11,229
]);

const keypair = Keypair.fromSecretKey(secretKey);
console.log('Chave pública derivada:', keypair.publicKey.toBase58());