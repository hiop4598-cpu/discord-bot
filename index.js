const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits 
} = require('discord.js');
const fs = require('fs');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ไฟล์สำหรับบันทึกข้อมูลการตั้งค่า
const DATA_FILE = './bot_data.json';
let botData = {
    rate: { text: 'ยังไม่ได้ตั้งค่าเรทราคา', image: null },
    payment: { text: 'ยังไม่ได้ตั้งค่าช่องทางชำระเงิน', image: null },
    historyChannelId: null
};

// โหลดข้อมูลเก่าถ้ามีไฟล์บันทึกอยู่
if (fs.existsSync(DATA_FILE)) {
    try {
        botData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (err) {
        console.error('Error loading data:', err);
    }
}

// ฟังก์ชันบันทึกข้อมูล
function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(botData, null, 2));
}

// สร้าง Slash Commands
const commands = [
    // 1. ตั้งค่าเรทราคา
    new SlashCommandBuilder()
        .setName('set-rate')
        .setDescription('เซ็ทข้อความและรูปภาพเรทราคา')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option => 
            option.setName('details').setDescription('ข้อความรายละเอียดเรทราคา').setRequired(true))
        .addAttachmentOption(option => 
            option.setName('image').setDescription('รูปภาพเรทราคา (แนบรูป)').setRequired(false)),

    // 2. ส่งเรทราคา
    new SlashCommandBuilder()
        .setName('rate')
        .setDescription('ส่งข้อความเรทราคาที่เซ็ทไว้'),

    // 3. ตั้งค่าระบบชำระเงิน
    new SlashCommandBuilder()
        .setName('set-payment')
        .setDescription('เซ็ทข้อความและรูปภาพ QR Code ชำระเงิน')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option => 
            option.setName('details').setDescription('ข้อความเลขบัญชี / ชื่อบัญชี').setRequired(true))
        .addAttachmentOption(option => 
            option.setName('qrcode').setDescription('รูปภาพ QR Code พร้อมเพย์/ธนาคาร').setRequired(false)),

    // 4. ส่งระบบชำระเงิน
    new SlashCommandBuilder()
        .setName('pay')
        .setDescription('ส่งช่องทางชำระเงินที่เซ็ทไว้'),

    // 5. ให้เครดิต / จบการขาย
    new SlashCommandBuilder()
        .setName('credit')
        .setDescription('ส่งข้อความขอบคุณและบันทึกประวัติการสั่งซื้อ')
        .addUserOption(option => 
            option.setName('customer').setDescription('ลูกค้าที่ซื้อ').setRequired(true))
        .addStringOption(option => 
            option.setName('product').setDescription('สินค้า/บริการ').setRequired(true))
        .addNumberOption(option => 
            option.setName('amount').setDescription('ยอดเงิน (บาท)').setRequired(true)),

    // 6. ตั้งค่าห้องประวัติการสั่งซื้อ
    new SlashCommandBuilder()
        .setName('set-history-channel')
        .setDescription('เซ็ทห้องสำหรับส่งสรุปประวัติการสั่งซื้อ')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option => 
            option.setName('channel').setDescription('เลือกห้องที่ต้องการให้บันทึกประวัติ').setRequired(true))
].map(command => command.toJSON());

// ลงทะเบียน Slash Commands เมื่อบอทออนไลน์
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

// จัดการการสั่งงาน Slash Commands
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;

    // --- 1. /set-rate ---
    if (commandName === 'set-rate') {
        const details = options.getString('details');
        const image = options.getAttachment('image');

        botData.rate.text = details;
        botData.rate.image = image ? image.url : null;
        saveData();

        await interaction.reply({ content: '✅ บันทึกระบบเรทราคาเรียบร้อยแล้ว!', ephemeral: true });
    }

    // --- 2. /rate ---
    if (commandName === 'rate') {
        const embed = new EmbedBuilder()
            .setTitle('📊 รายละเอียดเรทราคา')
            .setDescription(botData.rate.text)
            .setColor(0x00FFAA)
            .setTimestamp();

        if (botData.rate.image) {
            embed.setImage(botData.rate.image);
        }

        await interaction.reply({ embeds: [embed] });
    }

    // --- 3. /set-payment ---
    if (commandName === 'set-payment') {
        const details = options.getString('details');
        const qrcode = options.getAttachment('qrcode');

        botData.payment.text = details;
        botData.payment.image = qrcode ? qrcode.url : null;
        saveData();

        await interaction.reply({ content: '✅ บันทึกช่องทางชำระเงินเรียบร้อยแล้ว!', ephemeral: true });
    }

    // --- 4. /pay ---
    if (commandName === 'pay') {
        const embed = new EmbedBuilder()
            .setTitle('💳 ช่องทางการชำระเงิน')
            .setDescription(botData.payment.text)
            .setColor(0xFFAA00)
            .setTimestamp();

        if (botData.payment.image) {
            embed.setImage(botData.payment.image);
        }

        await interaction.reply({ embeds: [embed] });
    }

    // --- 5. /set-history-channel ---
    if (commandName === 'set-history-channel') {
        const channel = options.getChannel('channel');
        botData.historyChannelId = channel.id;
        saveData();

        await interaction.reply({ content: `✅ ตั้งค่าห้องประวัติการสั่งซื้อเป็น ${channel} เรียบร้อย!`, ephemeral: true });
    }

    // --- 6. /credit ---
    if (commandName === 'credit') {
        const customer = options.getUser('customer');
        const product = options.getString('product');
        const amount = options.getNumber('amount');

        // แสดงข้อความให้เครดิตในห้องปัจจุบัน
        const creditEmbed = new EmbedBuilder()
            .setTitle('🎉 ขอบคุณที่ใช้บริการครับ!')
            .setDescription(`ขอบคุณคุณ ${customer} ที่อุดหนุนสินค้ากับทางร้านเราครับ ❤️`)
            .addFields(
                { name: '📦 รายการสินค้า', value: product, inline: true },
                { name: '💵 ยอดชำระเงิน', value: `${amount.toLocaleString()} บาท`, inline: true }
            )
            .setColor(0x57F287)
            .setTimestamp();

        await interaction.reply({ embeds: [creditEmbed] });

        // ส่งสรุปเข้าห้องประวัติการสั่งซื้อ (ถ้าเซ็ตห้องไว้แล้ว)
        if (botData.historyChannelId) {
            const historyChannel = interaction.guild.channels.cache.get(botData.historyChannelId);
            if (historyChannel) {
                const historyEmbed = new EmbedBuilder()
                    .setTitle('📝 สรุปประวัติการสั่งซื้อ')
                    .addFields(
                        { name: '👤 ลูกค้า', value: `${customer} (${customer.tag})`, inline: false },
                        { name: '📦 สินค้า', value: product, inline: true },
                        { name: '💰 ยอดเงิน', value: `${amount.toLocaleString()} บาท`, inline: true },
                        { name: '🏠 ห้องที่ทำรายการ', value: `${interaction.channel.name}`, inline: false }
                    )
                    .setColor(0x3498DB)
                    .setTimestamp();

                await historyChannel.send({ embeds: [historyEmbed] });
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
