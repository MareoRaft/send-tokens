'use strict'
const _ = require('lodash');
const FlexContract = require('flex-contract');
const FlexEther = require('flex-ether');
const ABI = require('./contracts/token.json');
const BigNumber = require('bignumber.js');
const STARTING_TOKENS = new BigNumber('1e18').times(100).toString(10);
const STARTING_ETHER = new BigNumber('1e18').times(100).toString(10);
const lib = require('../');
const ethjs = require('ethereumjs-util');
const ethjshdwallet = require('ethereumjs-wallet/hdkey');
const ethwallet = require('ethereumjs-wallet');
const bip39 = require('bip39');
const crypto = require('crypto');
const ganache = require('ganache-cli');
const assert = require('assert');

describe('flex-contract', function() {
	let _ganache = null;
	let provider = null;
	let accounts = null;
	let token = null;

	before(async function() {
		accounts = _.times(16, () => randomAccount());
		provider = ganache.provider({
			accounts: _.map(accounts, acct => ({
				secretKey: acct.key,
				balance: STARTING_ETHER
			}))
		});
		// Suppress max listener warnings.
		provider.setMaxListeners(4096);
		provider.engine.setMaxListeners(4096);
	});

	beforeEach(async function() {
		token = new FlexContract(ABI, {provider: provider});
		await token.new();
		await token.mint(accounts[0].address, STARTING_TOKENS);
	});

	it('fails if insufficient balance', async function() {
		const amount = _.random(1, 1000);
		const to = randomAccount();
		await assert.rejects(lib.sendTokens(token.address, to.address, amount,
				{from: accounts[1].address, provider: provider}));
	});

	it('can transfer tokens via default account', async function() {
		const amount = _.random(1, 1000);
		const to = randomAccount();
		const {tx} = await lib.sendTokens(token.address, to.address, amount,
			{provider: provider});
		const receipt = await tx;
		assert.ok(receipt.transactionHash);
		assert.equal(await token.balanceOf(to.address), _.toString(amount));
	});

	it('can transfer tokens via private key', async function() {
		const amount = _.random(1, 1000);
		const to = randomAccount();
		const {tx} = await lib.sendTokens(token.address, to.address, amount,
			{key: accounts[0].key, provider: provider});
		const receipt = await tx;
		assert.ok(receipt.transactionHash);
		assert.equal(await token.balanceOf(to.address), _.toString(amount));
	});

	it('can transfer tokens via keystore', async function() {
		const amount = _.random(1, 1000);
		const to = randomAccount();
		const PW = crypto.randomBytes(8).toString('hex');
		const keystore = createKeystore(accounts[0], PW);
		const {tx} = await lib.sendTokens(token.address, to.address, amount,
			{keystore: keystore, password: PW, provider: provider});
		const receipt = await tx;
		assert.ok(receipt.transactionHash);
		assert.equal(await token.balanceOf(to.address), _.toString(amount));
	});

	it('can transfer tokens via mnemonic', async function() {
		const amount = _.random(1, 1000);
		const mnemonic = 'shantay you stay';
		const to = randomAccount();
		const from = fromMnemonic(mnemonic);
		await fundAccount(from.address, token);
		const {tx} = await lib.sendTokens(token.address, to.address, amount,
			{mnemonic: mnemonic, provider: provider});
		const receipt = await tx;
		assert.ok(receipt.transactionHash);
		assert.equal(await token.balanceOf(to.address), _.toString(amount));
	});
});

function randomAccount() {
	const key = crypto.randomBytes(32);
	const address = ethjs.toChecksumAddress(
		ethjs.bufferToHex(ethjs.privateToAddress(key)));
	return {
		key: ethjs.bufferToHex(key),
		address: address
	};
}

function createKeystore(acct, pw) {
	const wallet = ethwallet.fromPrivateKey(ethjs.toBuffer(acct.key));
	return wallet.toV3(pw);
}

function fromMnemonic(mnemonic, idx=0) {
	const seed = bip39.mnemonicToSeed(mnemonic.trim());
	const path = `m/44'/60'/0'/0/${idx}`;
	const node = ethjshdwallet.fromMasterSeed(seed).derivePath(path);
	const wallet = node.getWallet();
	return {
		address: wallet.getChecksumAddressString(),
		key: ethjs.bufferToHex(wallet.getPrivateKey())
	};
}

async function fundAccount(address, token) {
	const eth = new FlexEther({provider: token.web3.currentProvider});
	await eth.transfer(address, new BigNumber('1e18').toString(10));
	await token.mint(address, STARTING_TOKENS);
}