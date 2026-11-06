const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
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

const DATA_FILE = './bot_data.json';
let botData = {
    customCommands: {}, // เก็บคำสั่ง custom ทั้งหมด { 'wa': { text: '...', image: '...' } }
    historyChannelId: null
};

if (fs.existsSync(DATA_FILE)) {
    try {
        botData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (err) {
        console.error('Error loading data:', err);
    }
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(botData, null, 2));
}

// ฟังก์ชันอัปเดต Slash Commands ทั้งหมดไปที่ Discord
async function refreshCommands() {
    const defaultCommands = [
        new SlashCommandBuilder()
            .setName('set-cmd')
            .setDescription('สร้างหรือแก้ไขคำสั่ง Custom ของบอท (แอดมิน)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

        new SlashCommandBuilder()
            .setName('set-history-channel')
            .setDescription('ตั้งค่าห้องสำหรับส่งประวัติการสั่งซื้อ (แอดมิน)')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addChannelOption(option => option.setName('channel').setDescription('เลือกห้องประวัติ').setRequired(true)),

        new SlashCommandBuilder()
            .setName('credit')
            .setDescription('บันทึกเครดิตการขายและส่งประวัติไปยังห้องที่กำหนด')
            .addUserOption(option => option.setName('customer').setDescription('ลูกค้า').setRequired(true))
            .addStringOption(option => option.setName('product').setDescription('สินค้า').setRequired(true))
            .addNumberOption(option => option.setName('amount').setDescription('ยอดเงิน').setRequired(true))
    ];

    // ดึง Custom Commands ที่ผู้ใช้สร้างไว้มารวมเป็น Slash Command ด้วย
    for (const cmdName of Object.keys(botData.customCommands)) {
        defaultCommands.push(
            new SlashCommandBuilder()
                .setName(cmdName)
                .setDescription(`คำสั่งร้านค้า: /${cmdName}`)
        );
    }

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: defaultCommands.map(c => c.toJSON()) });
        console.log('Successfully reloaded application commands.');
    } catch (error) {
        console.error(error);
    }
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    await refreshCommands();
});

client.on('interactionCreate', async interaction => {
    // --- 1. จัดการ Slash Commands ---
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'set-cmd') {
            const embed = new EmbedBuilder()
                .setTitle('⚙️ ระบบสร้างคำสั่ง Custom ของบอท')
                .setDescription('กดปุ่มด้านล่างเพื่อเพิ่มคำสั่งใหม่ (เช่น `wa`, `pay`, `rate`) พร้อมใส่ข้อความและรูปภาพได้เลยครับ')
                .setColor(0x5865F2);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_create_cmd').setLabel('➕ สร้าง/แก้ไขคำสั่งใหม่').setStyle(ButtonStyle.Primary)
            );

            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        } 
        else if (commandName === 'set-history-channel') {
            const channel = interaction.options.getChannel('channel');
            botData.historyChannelId = channel.id;
            saveData();
            await interaction.reply({ content: `✅ ตั้งค่าห้องประวัติการสั่งซื้อเป็น ${channel} เรียบร้อย!`, ephemeral: true });
        }
        else if (commandName === 'credit') {
            const customer = interaction.options.getUser('customer');
            const product = interaction.options.getString('product');
            const amount = interaction.options.getNumber('amount');

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

            // ส่งประวัติไปอีกห้อง
            if (botData.historyChannelId) {
                const historyChannel = interaction.guild.channels.cache.get(botData.historyChannelId);
                if (historyChannel) {
                    const historyEmbed = new EmbedBuilder()
                        .setTitle('📝 สรุปประวัติการสั่งซื้อ')
                        .addFields(
                            { name: '👤 ลูกค้า', value: `${customer} (${customer.tag})`, inline: false },
                            { name: '📦 สินค้า', value: product, inline: true },
                            { name: '💰 ยอดเงิน', value: `${amount.toLocaleString()} บาท`, inline: true }
                        )
                        .setColor(0x3498DB)
                        .setTimestamp();
                    await historyChannel.send({ embeds: [historyEmbed] });
                }
            }
        }
        else if (botData.customCommands[commandName]) {
            // ถ้าเป็นคำสั่ง Custom ที่ผู้ใช้สร้างไว้
            const data = botData.customCommands[commandName];
            const embed = new EmbedBuilder()
                .setDescription(data.text)
                .setColor(0x00FFAA)
                .setTimestamp();

            if (data.image) {
                embed.setImage(data.image);
            }

            await interaction.reply({ embeds: [embed] });
        }
    }

    // --- 2. จัดการปุ่มกด (Buttons) ---
    if (interaction.isButton()) {
        if (interaction.customId === 'btn_create_cmd') {
            const modal = new ModalBuilder().setCustomId('modal_create_cmd').setTitle('สร้างคำสั่ง Custom ใหม่');
            
            const nameInput = new TextInputBuilder()
                .setCustomId('cmd_name')
                .setLabel('ชื่อคำสั่ง (เช่น wa, pay - ห้ามมีเว้นวรรค)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const textInput = new TextInputBuilder()
                .setCustomId('cmd_text')
                .setLabel('ข้อความที่ต้องการให้บอทรายงาน')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const imageInput = new TextInputBuilder()
                .setCustomId('cmd_image')
                .setLabel('ลิงก์รูปภาพ (Image URL - ไม่บังคับ)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            modal.addComponents(
                new ActionRowBuilder().addComponents(nameInput),
                new ActionRowBuilder().addComponents(textInput),
                new ActionRowBuilder().addComponents(imageInput)
            );

            await interaction.showModal(modal);
        }
    }

    // --- 3. บันทึกข้อมูลจาก Modal และรีเฟรชคำสั่ง ---
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_create_cmd') {
            let cmdName = interaction.fields.getTextInputValue('cmd_name').toLowerCase().trim().replace(/[^a-z0-9-_]/g, '');
            const cmdText = interaction.fields.getTextInputValue('cmd_text');
            const cmdImage = interaction.fields.getTextInputValue('cmd_image') || null;

            if (!cmdName) {
                return interaction.reply({ content: '❌ ชื่อคำสั่งไม่ถูกต้อง กรุณาใช้ภาษาอังกฤษตัวพิมพ์เล็ก', ephemeral: true });
            }

            botData.customCommands[cmdName] = {
                text: cmdText,
                image: cmdImage
            };
            saveData();

            // อัปเดต Slash Command ใหม่ให้ Discord ทันที
            await interaction.reply({ content: `✅ สร้าง/อัปเดตคำสั่ง \`/${cmdName}\` เรียบร้อยแล้ว! กำลังเปิดใช้งาน...`, ephemeral: true });
            await refreshCommands();
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
