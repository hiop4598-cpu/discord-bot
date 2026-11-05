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
    rate: { text: 'ยังไม่ได้ตั้งค่าเรทราคา', image: '' },
    payment: { text: 'ยังไม่ได้ตั้งค่าช่องทางชำระเงิน', image: '' },
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

// สร้าง Slash Commands
const commands = [
    new SlashCommandBuilder()
        .setName('panel')
        .setDescription('เปิดแผงควบคุมตั้งค่าระบบร้านค้า (แอดมิน)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('rate')
        .setDescription('ส่งข้อความเรทราคาที่เซ็ทไว้'),

    new SlashCommandBuilder()
        .setName('pay')
        .setDescription('ส่งช่องทางชำระเงินที่เซ็ทไว้'),

    new SlashCommandBuilder()
        .setName('credit')
        .setDescription('บันทึกเครดิตและสรุปยอดขาย')
        .addUserOption(option => option.setName('customer').setDescription('ลูกค้า').setRequired(true))
        .addStringOption(option => option.setName('product').setDescription('สินค้า').setRequired(true))
        .addNumberOption(option => option.setName('amount').setDescription('ยอดเงิน').setRequired(true))
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    // --- 1. จัดการ Slash Command ---
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'panel') {
            const embed = new EmbedBuilder()
                .setTitle('🛠️ แผงควบคุมระบบจัดการร้านค้า Draven')
                .setDescription('เลือกปุ่มด้านล่างเพื่อตั้งค่าข้อความ รูปภาพ หรือช่องประวัติการสั่งซื้อได้เลยครับ')
                .setColor(0x5865F2)
                .addFields(
                    { name: '📊 เรทราคาปัจจุบัน', value: botData.rate.text.substring(0, 100) + '...', inline: false },
                    { name: '💳 ช่องชำระเงินปัจจุบัน', value: botData.payment.text.substring(0, 100) + '...', inline: false },
                    { name: '📝 ห้องประวัติ', value: botData.historyChannelId ? `<#${botData.historyChannelId}>` : 'ยังไม่ได้ตั้งค่า', inline: false }
                );

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_set_rate').setLabel('ตั้งค่าเรทราคา').setStyle(ButtonStyle.Primary).setEmoji('📊'),
                new ButtonBuilder().setCustomId('btn_set_payment').setLabel('ตั้งค่าชำระเงิน').setStyle(ButtonStyle.Success).setEmoji('💳'),
                new ButtonBuilder().setCustomId('btn_set_channel').setLabel('ตั้งค่าห้องประวัติ').setStyle(ButtonStyle.Secondary).setEmoji('📝')
            );

            await interaction.reply({ embeds: [embed], components: [row1], ephemeral: true });
        }

        if (commandName === 'rate') {
            const embed = new EmbedBuilder()
                .setTitle('📊 รายละเอียดเรทราคา')
                .setDescription(botData.rate.text)
                .setColor(0x00FFAA)
                .setTimestamp();
            if (botData.rate.image) embed.setImage(botData.rate.image);
            await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'pay') {
            const embed = new EmbedBuilder()
                .setTitle('💳 ช่องทางการชำระเงิน')
                .setDescription(botData.payment.text)
                .setColor(0xFFAA00)
                .setTimestamp();
            if (botData.payment.image) embed.setImage(botData.payment.image);
            await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'credit') {
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
    }

    // --- 2. จัดการปุ่มกด (Buttons) เพื่อเด้ง Modal ---
    if (interaction.isButton()) {
        if (interaction.customId === 'btn_set_rate') {
            const modal = new ModalBuilder().setCustomId('modal_set_rate').setTitle('📊 ตั้งค่าเรทราคา');
            const textInput = new TextInputBuilder()
                .setCustomId('rate_text')
                .setLabel('รายละเอียดเรทราคา')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(botData.rate.text)
                .setRequired(true);
            const imageInput = new TextInputBuilder()
                .setCustomId('rate_image')
                .setLabel('ลิงก์รูปภาพ (Image URL - ไม่บังคับ)')
                .setStyle(TextInputStyle.Short)
                .setValue(botData.rate.image || '')
                .setRequired(false);

            modal.addComponents(new ActionRowBuilder().addComponents(textInput), new ActionRowBuilder().addComponents(imageInput));
            await interaction.showModal(modal);
        }

        if (interaction.customId === 'btn_set_payment') {
            const modal = new ModalBuilder().setCustomId('modal_set_payment').setTitle('💳 ตั้งค่าช่องทางชำระเงิน');
            const textInput = new TextInputBuilder()
                .setCustomId('pay_text')
                .setLabel('ข้อความเลขบัญชี / พร้อมเพย์')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(botData.payment.text)
                .setRequired(true);
            const imageInput = new TextInputBuilder()
                .setCustomId('pay_image')
                .setLabel('ลิงก์รูป QR Code (Image URL - ไม่บังคับ)')
                .setStyle(TextInputStyle.Short)
                .setValue(botData.payment.image || '')
                .setRequired(false);

            modal.addComponents(new ActionRowBuilder().addComponents(textInput), new ActionRowBuilder().addComponents(imageInput));
            await interaction.showModal(modal);
        }

        if (interaction.customId === 'btn_set_channel') {
            const modal = new ModalBuilder().setCustomId('modal_set_channel').setTitle('📝 ตั้งค่าห้องประวัติ');
            const channelInput = new TextInputBuilder()
                .setCustomId('channel_id')
                .setLabel('ID ห้องสำหรับส่งประวัติการสั่งซื้อ')
                .setStyle(TextInputStyle.Short)
                .setValue(botData.historyChannelId || '')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(channelInput));
            await interaction.showModal(modal);
        }
    }

    // --- 3. บันทึกข้อมูลจากหน้าที่กรอก (Modals) ---
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_set_rate') {
            botData.rate.text = interaction.fields.getTextInputValue('rate_text');
            botData.rate.image = interaction.fields.getTextInputValue('rate_image') || null;
            saveData();
            await interaction.reply({ content: '✅ บันทึกเรทราคาเรียบร้อยแล้ว!', ephemeral: true });
        }

        if (interaction.customId === 'modal_set_payment') {
            botData.payment.text = interaction.fields.getTextInputValue('pay_text');
            botData.payment.image = interaction.fields.getTextInputValue('pay_image') || null;
            saveData();
            await interaction.reply({ content: '✅ บันทึกช่องทางชำระเงินเรียบร้อยแล้ว!', ephemeral: true });
        }

        if (interaction.customId === 'modal_set_channel') {
            botData.historyChannelId = interaction.fields.getTextInputValue('channel_id');
            saveData();
            await interaction.reply({ content: `✅ บันทึกห้องประวัติเรียบร้อยแล้ว!`, ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
