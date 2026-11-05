const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const qrcode = require('qrcode');
const generatePayload = require('promptpay-qr');
const axios = require('axios');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// กำหนด ID ของห้องสำหรับส่งประวัติการสั่งซื้อ
const HISTORY_CHANNEL_ID = 'ใส่_ID_ห้องประวัติการซื้อตรงนี้';
// กำหนดชื่อยศที่อนุญาตให้ใช้คำสั่งได้ (เช่น "ผู้ดูแล" หรือ "Admin")
const ADMIN_ROLE_NAME = 'ผู้ดูแล';

const commands = [
    new SlashCommandBuilder()
        .setName('buy')
        .setDescription('สั่งซื้อสินค้าและสร้าง QR Code พร้อมชำระเงิน (เฉพาะผู้ดูแล)')
        .addStringOption(option => 
            option.setName('item').setDescription('ชื่อสินค้า').setRequired(true))
        .addNumberOption(option => 
            option.setName('price').setDescription('ราคาสินค้า (บาท)').setRequired(true))
        .addAttachmentOption(option => 
            option.setName('image').setDescription('แนบรูปภาพสินค้า (ถ้ามี)').setRequired(false)),

    new SlashCommandBuilder()
        .setName('verifyslip')
        .setDescription('ตรวจสอบสลิปโอนเงินอัตโนมัติ (เฉพาะผู้ดูแล)')
        .addAttachmentOption(option => 
            option.setName('slip').setDescription('แนบรูปสลิปโอนเงิน').setRequired(true))
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    // ตรวจสอบยศผู้ดูแล (Admin Role)
    const member = interaction.member;
    const hasAdminRole = member.roles.cache.some(role => role.name === ADMIN_ROLE_NAME);
    
    if (!hasAdminRole && !member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: `❌ คำสั่งนี้สามารถใช้ได้เฉพาะผู้ที่มีตำแหน่ง **"${ADMIN_ROLE_NAME}"** เท่านั้นครับ`, ephemeral: true });
    }

    const { commandName } = interaction;

    // 1. ระบบสั่งซื้อสินค้าและสร้าง QR Code พร้อมรูปภาพสินค้า (/buy)
    if (commandName === 'buy') {
        const itemName = interaction.options.getString('item');
        const price = interaction.options.getNumber('price');
        const itemImage = interaction.options.getAttachment('image');
        const promptpayNumber = process.env.PROMPTPAY_NUMBER;

        if (!promptpayNumber) {
            return interaction.reply({ content: '❌ ยังไม่ได้ตั้งค่าเบอร์ PromptPay ใน Environment Variables', ephemeral: true });
        }

        try {
            const payload = generatePayload(promptpayNumber, { amount: price });
            const buffer = await qrcode.toBuffer(payload);

            const embed = new EmbedBuilder()
                .setTitle('🛒 รายการสั่งซื้อสินค้า')
                .setDescription(`**สินค้า:** ${itemName}\n**ยอดที่ต้องชำระ:** \`${price.toLocaleString()} บาท\``)
                .setColor('Green')
                .setFooter({ text: 'กรุณาส่งสลิปตรวจสอบด้วยคำสั่ง /verifyslip หลังจากโอนเงินแล้ว' });

            if (itemImage) {
                embed.setImage(itemImage.url);
            }

            await interaction.reply({
                embeds: [embed],
                files: [{ attachment: buffer, name: 'qrcode.png' }]
            });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: '❌ เกิดข้อผิดพลาดในการสร้าง QR Code', ephemeral: true });
        }
    }

    // 2. ระบบเช็คสลิปและส่งรูปสลิปพร้อมประวัติไปยังอีกห้อง (/verifyslip)
    else if (commandName === 'verifyslip') {
        const slipAttachment = interaction.options.getAttachment('slip');
        const apiKey = process.env.EASYSLIP_API_KEY;

        if (!apiKey) {
            return interaction.reply({ content: '❌ ยังไม่ได้ตั้งค่า EASYSLIP_API_KEY ใน Environment Variables', ephemeral: true });
        }

        if (!slipAttachment.contentType || !slipAttachment.contentType.startsWith('image/')) {
            return interaction.reply({ content: '❌ กรุณาแนบไฟล์รูปภาพสลิปเท่านั้น', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            const response = await axios.post('https://api.easyslip.com/v1/verify', {
                image: slipAttachment.url
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = response.data;

            if (data.status === 200) {
                const receiver = data.data.receiver;
                const sender = data.data.sender;
                const amount = data.data.amount.amount;
                const transTime = data.data.transTimestamp;
                const buyer = interaction.user;

                await interaction.editReply(`✅ **ตรวจสอบสลิปสำเร็จ (ชำระเงินเรียบร้อย)**\n- **จำนวนเงิน:** \`${amount} บาท\`\n- **ผู้โอน:** \`${sender.name.th}\`\n- **เวลา:** \`${transTime}\``);

                // ส่งข้อมูลพร้อมรูปสลิปไปบันทึกที่ห้องประวัติการซื้ออัตโนมัติ
                if (HISTORY_CHANNEL_ID && HISTORY_CHANNEL_ID !== 'ใส่_ID_ห้องประวัติการซื้อตรงนี้') {
                    const historyChannel = await client.channels.fetch(HISTORY_CHANNEL_ID);
                    if (historyChannel) {
                        const historyEmbed = new EmbedBuilder()
                            .setTitle('📜 ประวัติการสั่งซื้อสินค้าสำเร็จ')
                            .addFields(
                                { name: '👤 ผู้ตรวจสอบ/ผู้ดูแล', value: `${buyer} (${buyer.tag})`, inline: false },
                                { name: '💰 ยอดชำระเงิน', value: `${amount.toLocaleString()} บาท`, inline: true },
                                { name: '🏦 ธนาคารผู้โอน', value: `${sender.bank.shortName}`, inline: true },
                                { name: '🕒 เวลาทำรายการ', value: `${transTime}`, inline: false }
                            )
                            .setImage(slipAttachment.url)
                            .setColor('Blue')
                            .setTimestamp();

                        await historyChannel.send({ embeds: [historyEmbed] });
                    }
                }
            } else {
                await interaction.editReply(`❌ **สลิปไม่ถูกต้องหรือไม่ผ่านการตรวจสอบ:** ${data.message || 'Error'}`);
            }
        } catch (error) {
            console.error(error?.response?.data || error.message);
            await interaction.editReply('❌ เกิดข้อผิดพลาดในการเชื่อมต่อระบบตรวจสอบสลิป (EasySlip)');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
