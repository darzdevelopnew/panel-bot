// Konfigurasi Atlantic Payment & Pterodactyl
export default {
  // Payment Settings
  ApikeyAtlantic: "jnYxjIU3LobkzwyiQGP3FdobSextyzDf2CApTL2YwsgP9TTrScpRqCuClI8sWv2rKx7oWrkgqFnvdS0LvDkdJhe637EjAqthVcQh",
  
  port: "2001",
  
  // Product Prices (dalam Rupiah)
  prices: {
    "1gb": 1000,
    "2gb": 2000, 
    "3gb": 3000,
    "4gb": 4000,
    "5gb": 5000,
    "unli": 10000,
    "reseller": 3000,
    "admin": 5000,
    "pt": 8000,
    "owner": 10000,
    "tk": 12000,
    "ceo": 15000
  },

  // Pterodactyl Settings
  domain: "https://your-pterodactyl-domain.com",
  plta: "ptla_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  pltc: "ptlc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", 
  loc: "1",
  eggs: "15",

  // Telegram Notifications
  telegramBotToken: "7853705746:AAFsZDSJnFCAyIFyOIiLnR_AcvZa6zqTn_o",
  adminTelegramId: "7961083543"
};