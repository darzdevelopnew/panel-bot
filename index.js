// index.js
import TelegramBot from 'node-telegram-bot-api';
import cors from 'cors';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import axios from 'axios';
import qs from 'qs';
import settings from './settings.js';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import publicIp from 'public-ip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = settings.port;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory storage untuk transaksi aktif
const activeTransactions = new Map();

// File untuk menyimpan data
const USER_DATA_FILE = './database/dataLogin.json';
const PROMO_CODES_FILE = './database/promoCodes.json';
const USER_DISCOUNTS_FILE = './database/userDiscounts.json';

// Buat instance bot
const bot = new TelegramBot(settings.telegramBotToken, { polling: true });

console.log('🤖 Bot Telegram berjalan...');

// Load data dari file
function loadData(filePath, defaultData = {}) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`Error loading data from ${filePath}:`, error);
  }
  return defaultData;
}

// Save data ke file
function saveData(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error saving data to ${filePath}:`, error);
    return false;
  }
}

// Load user data
function loadUserData() {
  return loadData(USER_DATA_FILE, { users: [] });
}

// Save user data
function saveUserData(userData) {
  return saveData(USER_DATA_FILE, userData);
}

// Load promo codes
function loadPromoCodes() {
  return loadData(PROMO_CODES_FILE, { promos: [] });
}

// Save promo codes
function savePromoCodes(promoData) {
  return saveData(PROMO_CODES_FILE, promoData);
}

// Load user discounts
function loadUserDiscounts() {
  return loadData(USER_DISCOUNTS_FILE, { discounts: [] });
}

// Save user discounts
function saveUserDiscounts(discountData) {
  return saveData(USER_DISCOUNTS_FILE, discountData);
}

// Helper functions
function generatePassword(length = 8) {
  const chars = "1234567890";
  let pass = "";
  for (let i = 0; i < length; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

function generateUserId() {
  return 'USER_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function generateCouponCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Hash password
async function hashPassword(password) {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

// Compare password
async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

// Command: /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeText = `
🎉 *Selamat Datang di Bot Panel!*

*Perintah yang tersedia:*
/listusers - Lihat semua users
/addpromo - Tambah kupon promo
/listpromos - Lihat semua kupon

Bot ini digunakan untuk monitoring sistem panel otomatis.
  `;

  bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' });
});

// Command: /listusers - List semua users
bot.onText(/\/listusers/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (msg.from.id.toString() !== settings.adminTelegramId) {
    return bot.sendMessage(chatId, '❌ Maaf, hanya admin yang bisa menggunakan command ini.');
  }

  try {
    const userData = loadUserData();
    const users = userData.users || [];
    
    if (users.length === 0) {
      return bot.sendMessage(chatId, '📭 Tidak ada user yang terdaftar.');
    }

    let message = `📋 *DAFTAR USER (${users.length})*\n\n`;
    
    users.forEach((user, index) => {
      message += `👤 *${user.name}*\n`;
      message += `🆔 ${user.id}\n`;
      message += `📧 ${user.email}\n`;
      message += `🎯 Role: ${user.role}\n`;
      message += `📅 Bergabung: ${new Date(user.createdAt).toLocaleDateString('id-ID')}\n`;
      message += `🛒 Total Order: ${user.orderCount || 0}\n`;
      message += `💰 Total Belanja: Rp ${(user.totalSpent || 0).toLocaleString('id-ID')}\n\n`;
    });

    if (message.length > 4096) {
      const mid = message.lastIndexOf('\n\n', 4000);
      const firstPart = message.substring(0, mid);
      const secondPart = message.substring(mid);
      
      bot.sendMessage(chatId, firstPart, { parse_mode: 'Markdown' });
      bot.sendMessage(chatId, secondPart, { parse_mode: 'Markdown' });
    } else {
      bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('Error listing users:', error);
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

// Command: /addpromo - Tambah kupon promo
bot.onText(/\/addpromo/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (msg.from.id.toString() !== settings.adminTelegramId) {
    return bot.sendMessage(chatId, '❌ Maaf, hanya admin yang bisa menggunakan command ini.');
  }

  try {
    const promoData = loadPromoCodes();
    const newPromoCode = generateCouponCode();
    
    const newPromo = {
      code: newPromoCode,
      discount: 10,
      maxUses: 50,
      usedCount: 0,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      isActive: true
    };

    promoData.promos.push(newPromo);
    savePromoCodes(promoData);

    const message = `🎉 *KUPON BARU DIBUAT!*\n\n` +
                   `🛒 Kode: *${newPromoCode}*\n` +
                   `💰 Diskon: *${newPromo.discount}%*\n` +
                   `🎯 Maksimal: *${newPromo.maxUses} user*\n` +
                   `📅 Kadaluarsa: *${new Date(newPromo.expiresAt).toLocaleDateString('id-ID')}*`;

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Error adding promo:', error);
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

// Command: /listpromos - Lihat semua kupon
bot.onText(/\/listpromos/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (msg.from.id.toString() !== settings.adminTelegramId) {
    return bot.sendMessage(chatId, '❌ Maaf, hanya admin yang bisa menggunakan command ini.');
  }

  try {
    const promoData = loadPromoCodes();
    const promos = promoData.promos || [];
    
    if (promos.length === 0) {
      return bot.sendMessage(chatId, '📭 Tidak ada kupon yang tersedia.');
    }

    let message = `🎫 *DAFTAR KUPON (${promos.length})*\n\n`;
    
    promos.forEach((promo, index) => {
      const isExpired = new Date(promo.expiresAt) < new Date();
      const status = isExpired ? '❌ EXPIRED' : (promo.isActive ? '✅ AKTIF' : '❌ NONAKTIF');
      
      message += `🎫 *${promo.code}*\n`;
      message += `💰 Diskon: ${promo.discount}%\n`;
      message += `📊 Digunakan: ${promo.usedCount}/${promo.maxUses}\n`;
      message += `📅 Kadaluarsa: ${new Date(promo.expiresAt).toLocaleDateString('id-ID')}\n`;
      message += `🎯 Status: ${status}\n\n`;
    });

    if (message.length > 4096) {
      const parts = message.match(/[\s\S]{1,4000}/g) || [];
      for (const part of parts) {
        await bot.sendMessage(chatId, part, { parse_mode: 'Markdown' });
      }
    } else {
      bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('Error listing promos:', error);
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

// API Routes untuk User Management

// Login user dengan username atau email
app.post('/api/login', async (req, res) => {
  const { username, password, email } = req.body;

  // Support both username and email login
  const loginIdentifier = username || email;

  if (!loginIdentifier || !password) {
    return res.status(400).json({ error: 'Username/email dan password diperlukan' });
  }

  try {
    const userData = loadUserData();
    
    // Cari user by username atau email
    const user = userData.users.find(user => 
      user.username === loginIdentifier || user.email === loginIdentifier
    );
    
    if (!user) {
      return res.status(400).json({ error: 'Username/email atau password salah' });
    }

    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Username/email atau password salah' });
    }

    user.lastLogin = new Date().toISOString();
    saveUserData(userData);

    console.log(`🔐 USER LOGIN: ${user.name} (${user.username || user.email}) - ID: ${user.id}`);

    const { password: _, ...userWithoutPassword } = user;
    res.json({
      success: true,
      message: 'Login berhasil!',
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Update register endpoint untuk include username
app.post('/api/register', async (req, res) => {
  const { name, username, email, password } = req.body;

  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Nama, username, dan password diperlukan' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password minimal 6 karakter' });
  }

  try {
    const userData = loadUserData();
    
    // Check if username already exists
    const existingUser = userData.users.find(user => 
      user.username === username || user.email === (email || username)
    );
    
    if (existingUser) {
      return res.status(400).json({ error: 'Username sudah terdaftar' });
    }

    const userId = generateUserId();
    const hashedPassword = await hashPassword(password);
    
    const newUser = {
      id: userId,
      name,
      username,
      email: email || `${username}@panel.com`, // Default email if not provided
      password: hashedPassword,
      role: 'member',
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      orderCount: 0,
      totalSpent: 0,
      couponsClaimed: 0
    };

    userData.users.push(newUser);
    
    if (saveUserData(userData)) {
      console.log(`👤 USER REGISTERED: ${name} (${username}) - ID: ${userId}`);
      
      const { password: _, ...userWithoutPassword } = newUser;
      res.json({
        success: true,
        message: 'Registrasi berhasil!',
        user: userWithoutPassword
      });
    } else {
      res.status(500).json({ error: 'Gagal menyimpan data user' });
    }
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Get user by ID
app.get('/api/user/:userId', (req, res) => {
  const { userId } = req.params;

  try {
    const userData = loadUserData();
    const user = userData.users.find(user => user.id === userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    const { password: _, ...userWithoutPassword } = user;
    res.json({
      success: true,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Get semua users (untuk admin)
app.get('/api/users', (req, res) => {
  try {
    const userData = loadUserData();
    
    const usersWithoutPassword = userData.users.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });

    res.json({
      success: true,
      users: usersWithoutPassword
    });
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// API untuk Kupon Management

// Klaim kupon
app.post('/api/claim-coupon', async (req, res) => {
  const { userId, couponCode } = req.body;

  if (!userId || !couponCode) {
    return res.status(400).json({ error: 'User ID dan kode kupon diperlukan' });
  }

  try {
    const userData = loadUserData();
    const promoData = loadPromoCodes();
    const discountData = loadUserDiscounts();

    const user = userData.users.find(user => user.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    const promo = promoData.promos.find(p => 
      p.code === couponCode.toUpperCase() && p.isActive
    );

    if (!promo) {
      return res.status(400).json({ error: 'Kupon tidak valid atau tidak aktif' });
    }

    if (new Date(promo.expiresAt) < new Date()) {
      return res.status(400).json({ error: 'Kupon sudah kadaluarsa' });
    }

    if (promo.usedCount >= promo.maxUses) {
      return res.status(400).json({ error: 'Kupon sudah mencapai batas penggunaan' });
    }

    const existingDiscount = discountData.discounts.find(d => 
      d.userId === userId && d.couponCode === couponCode.toUpperCase()
    );

    if (existingDiscount) {
      return res.status(400).json({ error: 'Anda sudah mengklaim kupon ini sebelumnya' });
    }

    const userDiscount = {
      id: `DISC_${Date.now()}`,
      userId: userId,
      couponCode: couponCode.toUpperCase(),
      discountPercent: promo.discount,
      claimedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      isUsed: false
    };

    discountData.discounts.push(userDiscount);
    
    promo.usedCount += 1;
    
    user.couponsClaimed = (user.couponsClaimed || 0) + 1;

    saveUserDiscounts(discountData);
    savePromoCodes(promoData);
    saveUserData(userData);

    console.log(`🎫 COUPON CLAIMED: ${user.name} (${user.email}) - Kupon: ${couponCode}`);

    bot.sendMessage(settings.adminTelegramId, 
      `🎫 *KUPON DIKLAIM!*\n\n` +
      `👤 User: ${user.name}\n` +
      `📧 Email: ${user.email}\n` +
      `🎫 Kode: ${couponCode}\n` +
      `💰 Diskon: ${promo.discount}%\n` +
      `📊 Penggunaan: ${promo.usedCount}/${promo.maxUses}`,
      { parse_mode: 'Markdown' }
    );

    res.json({
      success: true,
      message: `Kupon berhasil diklaim! Anda mendapatkan diskon ${promo.discount}%`,
      discount: promo.discount,
      expiresAt: userDiscount.expiresAt
    });

  } catch (error) {
    console.error('Error claiming coupon:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Get active discount untuk user
app.get('/api/user-discount/:userId', (req, res) => {
  const { userId } = req.params;

  try {
    const discountData = loadUserDiscounts();
    const now = new Date();
    
    const activeDiscount = discountData.discounts.find(d => 
      d.userId === userId && 
      !d.isUsed && 
      new Date(d.expiresAt) > now
    );

    if (activeDiscount) {
      res.json({
        success: true,
        hasDiscount: true,
        discount: activeDiscount
      });
    } else {
      res.json({
        success: true,
        hasDiscount: false
      });
    }
  } catch (error) {
    console.error('Error getting user discount:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Mark discount as used
app.post('/api/use-discount', (req, res) => {
  const { discountId } = req.body;

  try {
    const discountData = loadUserDiscounts();
    const discount = discountData.discounts.find(d => d.id === discountId);
    
    if (discount) {
      discount.isUsed = true;
      discount.usedAt = new Date().toISOString();
      saveUserDiscounts(discountData);
      
      res.json({
        success: true,
        message: 'Diskon berhasil digunakan'
      });
    } else {
      res.status(404).json({ error: 'Diskon tidak ditemukan' });
    }
  } catch (error) {
    console.error('Error using discount:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Get semua kupon (untuk admin)
app.get('/api/promos', (req, res) => {
  try {
    const promoData = loadPromoCodes();
    res.json({
      success: true,
      promos: promoData.promos || []
    });
  } catch (error) {
    console.error('Error getting promos:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Create promo code (untuk admin)
app.post('/api/create-promo', (req, res) => {
  const { code, discount, maxUses, expiresInDays } = req.body;

  if (!code || !discount || !maxUses) {
    return res.status(400).json({ error: 'Kode, diskon, dan maksimal penggunaan diperlukan' });
  }

  try {
    const promoData = loadPromoCodes();
    
    const existingPromo = promoData.promos.find(p => p.code === code.toUpperCase());
    if (existingPromo) {
      return res.status(400).json({ error: 'Kode kupon sudah ada' });
    }

    const newPromo = {
      code: code.toUpperCase(),
      discount: parseInt(discount),
      maxUses: parseInt(maxUses),
      usedCount: 0,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (expiresInDays || 30) * 24 * 60 * 60 * 1000).toISOString(),
      isActive: true
    };

    promoData.promos.push(newPromo);
    savePromoCodes(promoData);

    console.log(`🎫 PROMO CREATED: ${newPromo.code} - ${newPromo.discount}%`);

    res.json({
      success: true,
      message: 'Kupon berhasil dibuat',
      promo: newPromo
    });

  } catch (error) {
    console.error('Error creating promo:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Fungsi untuk membuat user di Pterodactyl
async function createPterodactylUser(username, email, password, isAdmin = false) {
  try {
    const userRes = await fetch(`${settings.domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.plta}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: username,
        email: email,
        first_name: username,
        last_name: 'User',
        password: password,
        root_admin: isAdmin
      })
    });

    const userData = await userRes.json();
    
    if (userData.errors) {
      throw new Error(userData.errors[0].detail);
    }

    return userData.attributes;
  } catch (error) {
    throw error;
  }
}

// Fungsi untuk membuat server di Pterodactyl
async function createPterodactylServer(username, packageType) {
  try {
    const paketConfig = {
      "1gb": { ram: 1024, disk: 2048 },
      "2gb": { ram: 2048, disk: 4096 },
      "3gb": { ram: 3072, disk: 6144 },
      "4gb": { ram: 4096, disk: 8192 },
      "5gb": { ram: 5120, disk: 10240 },
      "unli": { ram: 0, disk: 0 }
    }[packageType] || { ram: 1024, disk: 2048 };

    const name = username;
    const password = username + generatePassword(3);
    const email = `${username}@panel.com`;

    const user = await createPterodactylUser(username, email, password);

    const eggData = await fetch(`${settings.domain}/api/application/nests/1/eggs/${settings.eggs}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${settings.plta}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    const eggJson = await eggData.json();
    const startup = eggJson.attributes.startup;

    const serverRes = await fetch(`${settings.domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.plta}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name + '-server',
        user: user.id,
        egg: parseInt(settings.eggs),
        docker_image: eggJson.attributes.docker_image,
        startup,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: paketConfig.ram,
          swap: 0,
          disk: paketConfig.disk,
          io: 500,
          cpu: 100
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 5
        },
        deploy: {
          locations: [parseInt(settings.loc)],
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const serverData = await serverRes.json();
    
    if (serverData.errors) {
      throw new Error(serverData.errors[0].detail);
    }

    return {
      user: user,
      server: serverData.attributes,
      password: password,
      email: email
    };
  } catch (error) {
    throw error;
  }
}

// Fungsi untuk membuat admin panel
async function createAdminPanel(username) {
  try {
    const email = `${username}@admin.com`;
    const password = username + generatePassword(3);

    const user = await createPterodactylUser(username, email, password, true);

    return {
      user: user,
      password: password,
      email: email
    };
  } catch (error) {
    throw error;
  }
}

// Create order dengan diskon
app.post('/api/create-order', async (req, res) => {
  const { productType, username, isAdminPanel = false, userId, applyDiscount = false } = req.body;

  if (!productType || !username) {
    return res.status(400).json({ error: 'Product type and username are required' });
  }

  const originalPrice = settings.prices[productType];
  if (!originalPrice) {
    return res.status(400).json({ error: 'Invalid product type' });
  }

  let finalPrice = originalPrice;
  let discountApplied = 0;
  let discountId = null;

  if (applyDiscount && userId) {
    try {
      const discountData = loadUserDiscounts();
      const now = new Date();
      
      const activeDiscount = discountData.discounts.find(d => 
        d.userId === userId && 
        !d.isUsed && 
        new Date(d.expiresAt) > now
      );

      if (activeDiscount) {
        discountApplied = Math.round(originalPrice * (activeDiscount.discountPercent / 100));
        finalPrice = originalPrice - discountApplied;
        discountId = activeDiscount.id;
        
        activeDiscount.isUsed = true;
        activeDiscount.usedAt = new Date().toISOString();
        saveUserDiscounts(discountData);

        console.log(`💰 DISCOUNT APPLIED: ${activeDiscount.discountPercent}% - Rp ${discountApplied}`);
      }
    } catch (discountError) {
      console.error('Error applying discount:', discountError);
    }
  }

  try {
    const reff = `WEB-${Date.now()}`;
    
    const payload = qs.stringify({
      api_key: settings.ApikeyAtlantic,
      reff_id: reff,
      nominal: finalPrice,
      type: "ewallet",
      metode: "qris"
    });

    console.log('🔄 Mengirim request ke Atlantic Payment...');
    
    const response = await axios.post("https://atlantich2h.com/deposit/create", payload, {
      headers: { 
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "AutoBuyPanel/1.0"
      },
      timeout: 30000,
      validateStatus: function (status) {
        return status < 500;
      }
    });

    const data = response.data;

    if (!data) {
      console.error('❌ Tidak ada response dari Atlantic Payment');
      return res.status(500).json({ error: "Tidak ada response dari payment gateway" });
    }

    if (!data.status) {
      const errorMessage = data?.message || "Failed to create QRIS - Invalid response";
      console.error('❌ Atlantic Payment error:', errorMessage);
      return res.status(500).json({ error: errorMessage });
    }

    const info = data.data;
    
    if (!info) {
      console.error('❌ Tidak ada data transaksi dari Atlantic');
      return res.status(500).json({ error: "No transaction data received" });
    }

    const transactionId = info.id || `TEMP_${Date.now()}`;

    if (userId) {
      try {
        const userData = loadUserData();
        const user = userData.users.find(user => user.id === userId);
        if (user) {
          user.orderCount = (user.orderCount || 0) + 1;
          user.totalSpent = (user.totalSpent || 0) + finalPrice;
          saveUserData(userData);
        }
      } catch (userError) {
        console.error('Error updating user data:', userError);
      }
    }

    activeTransactions.set(transactionId, {
      id: transactionId,
      reff,
      productType,
      username,
      isAdminPanel,
      originalPrice,
      finalPrice,
      discountApplied,
      discountId,
      userId: userId || null,
      status: 'pending',
      createdAt: new Date(),
      atlanticId: info.id,
      expiresAt: info.expired_at || new Date(Date.now() + 10 * 60 * 1000).toISOString()
    });

    let qrImage;
    try {
      const qrSource = info.qr_string || info.qr_image;
      if (qrSource) {
        qrImage = await QRCode.toDataURL(qrSource);
        console.log('✅ QR Code berhasil digenerate');
      } else {
        console.log('⚠️  Tidak ada QR string, menggunakan fallback QR');
        qrImage = await QRCode.toDataURL(`https://example.com/payment/${transactionId}`);
      }
    } catch (qrError) {
      console.error('Error generating QR code:', qrError);
      qrImage = await QRCode.toDataURL(`Payment: ${finalPrice}`);
    }

    console.log('✅ Transaksi berhasil dibuat:', transactionId);

    res.json({
      success: true,
      transactionId,
      reff,
      productType,
      username,
      originalPrice,
      finalPrice,
      discountApplied,
      qrImage,
      qrString: info.qr_string || info.qr_image || '',
      expiresAt: info.expired_at || new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      atlanticId: info.id,
      fee: info.fee || 0,
      getBalance: info.get_balance || finalPrice
    });

  } catch (error) {
    console.error('❌ Payment gateway error details:');
    console.error('   Code:', error.code);
    console.error('   Message:', error.message);
    
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', error.response.data);
    }
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(500).json({ error: 'Tidak dapat terhubung ke payment gateway. Silakan coba lagi.' });
    } else if (error.code === 'ETIMEDOUT') {
      return res.status(500).json({ error: 'Timeout menghubungi payment gateway. Silakan coba lagi.' });
    } else if (error.response) {
      return res.status(500).json({ 
        error: `Payment gateway error: ${error.response.data?.message || error.response.statusText}` 
      });
    } else if (error.request) {
      return res.status(500).json({ 
        error: 'Tidak ada response dari payment gateway. Silakan coba lagi.' 
      });
    } else {
      return res.status(500).json({ 
        error: `Payment gateway error: ${error.message}` 
      });
    }
  }
});

// Cek status pembayaran
app.post('/api/check-payment-status', async (req, res) => {
  const { transactionId } = req.body;

  if (!transactionId) {
    return res.status(400).json({ error: 'Transaction ID diperlukan' });
  }

  try {
    const transaction = activeTransactions.get(transactionId);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    }

    const payload = qs.stringify({
      api_key: settings.ApikeyAtlantic,
      id: transaction.atlanticId
    });

    const response = await axios.post("https://atlantich2h.com/deposit/status", payload, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 10000
    });

    const data = response.data;
    
    if (!data?.status) {
      return res.status(500).json({ error: data?.message || "Gagal memeriksa status" });
    }

    const statusInfo = data.data;
    
    transaction.status = statusInfo.status;
    activeTransactions.set(transactionId, transaction);

    if (statusInfo.status === 'success') {
      try {
        let result;
        if (transaction.isAdminPanel) {
          result = await createAdminPanel(transaction.username);
        } else {
          result = await createPterodactylServer(transaction.username, transaction.productType);
        }

        let telegramMessage = `✅ PEMBAYARAN BERHASIL!\n\n` +
          `👤 User: ${transaction.username}\n` +
          `🎯 Produk: ${transaction.productType}\n` +
          `💰 Total: Rp ${transaction.finalPrice.toLocaleString('id-ID')}\n`;

        if (transaction.discountApplied > 0) {
          telegramMessage += `🎫 Diskon: Rp ${transaction.discountApplied.toLocaleString('id-ID')}\n`;
        }

        telegramMessage += `📝 Tipe: ${transaction.isAdminPanel ? 'Admin Panel' : 'User Panel'}\n` +
          `🆔 Ref: ${transaction.reff}`;

        bot.sendMessage(settings.adminTelegramId, telegramMessage, { parse_mode: 'Markdown' });

        res.json({
          success: true,
          status: 'success',
          message: 'Pembayaran berhasil dan panel sedang dibuat',
          transaction: {
            ...transaction,
            panelInfo: result
          }
        });
      } catch (panelError) {
        console.error('Error creating panel:', panelError);
        res.json({
          success: true,
          status: 'success',
          message: 'Pembayaran berhasil tetapi gagal membuat panel. Silakan hubungi admin.',
          transaction: transaction
        });
      }
    } else {
      res.json({
        success: true,
        status: statusInfo.status,
        message: `Status: ${statusInfo.status}`,
        transaction: transaction
      });
    }

  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Gagal memeriksa status pembayaran: ' + error.message });
  }
});

// Batalkan transaksi
app.post('/api/cancel-transaction', async (req, res) => {
  const { transactionId } = req.body;

  if (!transactionId) {
    return res.status(400).json({ error: 'Transaction ID diperlukan' });
  }

  try {
    const transaction = activeTransactions.get(transactionId);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    }

    const payload = qs.stringify({
      api_key: settings.ApikeyAtlantic,
      id: transaction.atlanticId
    });

    const response = await axios.post("https://atlantich2h.com/deposit/cancel", payload, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 10000
    });

    const data = response.data;
    
    if (data?.status) {
      activeTransactions.delete(transactionId);
      
      bot.sendMessage(settings.adminTelegramId, 
        `❌ TRANSAKSI DIBATALKAN!\n\n` +
        `👤 User: ${transaction.username}\n` +
        `🎯 Produk: ${transaction.productType}\n` +
        `💰 Total: Rp ${transaction.finalPrice.toLocaleString('id-ID')}\n` +
        `🆔 Ref: ${transaction.reff}\n` +
        `📝 Alasan: Dibatalkan oleh user`,
        { parse_mode: 'Markdown' }
      );

      res.json({
        success: true,
        message: 'Transaksi berhasil dibatalkan'
      });
    } else {
      res.status(500).json({ error: data?.message || "Gagal membatalkan transaksi" });
    }

  } catch (error) {
    console.error('Cancel error:', error);
    
    activeTransactions.delete(transactionId);
    
    res.status(500).json({ error: 'Gagal membatalkan transaksi: ' + error.message });
  }
});

// Get active transactions (untuk debugging)
app.get('/api/active-transactions', (req, res) => {
  const transactions = Array.from(activeTransactions.entries()).map(([id, transaction]) => ({
    id,
    ...transaction
  }));
  
  res.json({
    success: true,
    count: transactions.length,
    transactions
  });
});

// Get products list
app.get('/api/products', (req, res) => {
  const products = {
    userPanels: [
      { id: '1gb', name: '1GB Panel', price: settings.prices['1gb'], type: 'user' },
      { id: '2gb', name: '2GB Panel', price: settings.prices['2gb'], type: 'user' },
      { id: '3gb', name: '3GB Panel', price: settings.prices['3gb'], type: 'user' },
      { id: '4gb', name: '4GB Panel', price: settings.prices['4gb'], type: 'user' },
      { id: '5gb', name: '5GB Panel', price: settings.prices['5gb'], type: 'user' },
      { id: 'unli', name: 'Unlimited Panel', price: settings.prices['unli'], type: 'user' }
    ],
    adminPanels: [
      { id: 'reseller', name: 'Reseller', price: settings.prices['reseller'], type: 'admin' },
      { id: 'admin', name: 'Admin Panel', price: settings.prices['admin'], type: 'admin' },
      { id: 'pt', name: 'PT Panel', price: settings.prices['pt'], type: 'admin' },
      { id: 'owner', name: 'Owner Panel', price: settings.prices['owner'], type: 'admin' },
      { id: 'tk', name: 'TK Panel', price: settings.prices['tk'], type: 'admin' },
      { id: 'ceo', name: 'CEO Panel', price: settings.prices['ceo'], type: 'admin' }
    ]
  };

  res.json(products);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    activeTransactions: activeTransactions.size,
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/api/ping', (req, res) => {
  res.json({ 
    success: true, 
    message: 'pong', 
    timestamp: Date.now(),
    server: 'Auto Buy Panel'
  });
});

// Auto cancel expired transactions
setInterval(async () => {
  const now = new Date();
  
  for (const [id, transaction] of activeTransactions.entries()) {
    if (transaction.expiresAt && new Date(transaction.expiresAt) < now) {
      try {
        console.log(`🕒 Auto cancel expired transaction: ${id}`);
        activeTransactions.delete(id);
      } catch (error) {
        console.error('Error auto-canceling transaction:', error);
      }
    }
    
    if (transaction.createdAt && (now - transaction.createdAt) > 24 * 60 * 60 * 1000) {
      activeTransactions.delete(id);
      console.log(`🧹 Cleanup old transaction: ${id}`);
    }
  }
}, 60000);

// Clean up expired discounts
setInterval(() => {
  try {
    const discountData = loadUserDiscounts();
    const now = new Date();
    
    const activeDiscounts = discountData.discounts.filter(d => 
      new Date(d.expiresAt) > now
    );
    
    if (activeDiscounts.length !== discountData.discounts.length) {
      discountData.discounts = activeDiscounts;
      saveUserDiscounts(discountData);
      console.log(`🧹 Cleaned up expired discounts`);
    }
  } catch (error) {
    console.error('Error cleaning up discounts:', error);
  }
}, 24 * 60 * 60 * 1000);

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server berjalan di PORT ${PORT}`);
  console.log(`🌐 Local: http://localhost:${PORT}`);
});