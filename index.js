const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const qrcode = require('qrcode');
const generatePayload = require('promptpay-qr');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// 1. ใส่ ID ของห้อง Discord ที่ต้องการให้ประวัติการซื้อเด้งไปแสดง
const HISTORY_CHANNEL_ID = 'ใส่_ID_ห้องประวัติการซื้อตรงนี้';

// 2. กำหนดชื่อยศผู้ดูแลที่สามารถใช้คำสั่งได้
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
        .setDescription('บันทึกประวัติการสั่งซื้อและแนบสลิป (เฉพาะผู้ดูแล)')
        .addAttachmentOption(option => 
            option.setName('slip').setDescription('แนบรูปภาพสลิปการโอนเงิน').setRequired(true))
        .addNumberOption(option => 
            option.setName('amount').setDescription('จำนวนเงินที่โอน (บาท)').setRequired(true))
        .addStringOption(option => 
            option.setName('note').setDescription('หมายเหตุ หรือชื่อสินค้า (ถ้ามี)').setRequired(false))
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

    // 1. คำสั่งสั่งซื้อสินค้าและสร้าง QR Code (/buy)
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
                .setFooter({ text: 'เมื่อโอนเงินเรียบร้อยแล้ว แจ้งผู้ดูแลเพื่อยืนยันรายการ' });

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

    // 2. คำสั่งบันทึกสลิปและส่งไปยังห้องประวัติการซื้อ (/verifyslip)
    else if (commandName === 'verifyslip') {
        const slipAttachment = interaction.options.getAttachment('slip');
        const amount = interaction.options.getNumber('amount');
        const note = interaction.options.getString('note') || 'ไม่มี';

        if (!slipAttachment.contentType || !slipAttachment.contentType.startsWith('image/')) {
            return interaction.reply({ content: '❌ กรุณาแนบไฟล์รูปภาพสลิปเท่านั้น', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            // ส่งประวัติพร้อมสลิปไปที่ห้องประวัติการซื้อ
            if (HISTORY_CHANNEL_ID && HISTORY_CHANNEL_ID !== '1510256256974196917') {
                const historyChannel = await client.channels.fetch(HISTORY_CHANNEL_ID);
                if (historyChannel) {
                    const historyEmbed = new EmbedBuilder()
                        .setTitle('📜 ประวัติการสั่งซื้อสินค้าสำเร็จ')
                        .addFields(
                            { name: '👤 ผู้ดูแลที่บันทึก', value: `${interaction.user} (${interaction.user.tag})`, inline: false },
                            { name: '💰 ยอดชำระเงิน', value: `${amount.toLocaleString()} บาท`, inline: true },
                            { name: '📝 รายละเอียด/หมายเหตุ', value: `${note}`, inline: true }
                        )
                        .setImage(slipAttachment.url)
                        .setColor('Blue')
                        .setTimestamp();

                    await historyChannel.send({ embeds: [historyEmbed] });
                    await interaction.editReply('✅ **บันทึกประวัติการสั่งซื้อและส่งรูปสลิปไปยังห้องประวัติเรียบร้อยแล้ว!**');
                } else {
                    await interaction.editReply('❌ ไม่พบช่องประวัติการสั่งซื้อ กรุณาเช็ค HISTORY_CHANNEL_ID');
                }
            } else {
                await interaction.editReply('❌ ยังไม่ได้ตั้งค่า HISTORY_CHANNEL_ID ในไฟล์ index.js');
            }
        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ เกิดข้อผิดพลาดในการส่งประวัติการสั่งซื้อ');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
