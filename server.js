const express = require('express');
const cors = require('cors');
const { Client } = require('discord.js-selfbot-v13');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/clone', async (req, res) => {
    const { token, sourceId, destId } = req.body;

    if (!token || !sourceId || !destId) {
        return res.status(400).json({ error: 'جميع الحقول مطلوبة!' });
    }

    const client = new Client({ checkUpdate: false });

    client.on('ready', async () => {
        try {
            const sourceGuild = client.guilds.cache.get(sourceId);
            const destGuild = client.guilds.cache.get(destId);

            if (!sourceGuild || !destGuild) {
                client.destroy();
                return res.status(404).json({ error: 'تعذر العثور على السيرفر المصدر أو الهدف. تأكد من وجود الحساب فيهما.' });
            }

            // 1. تنظيف السيرفر المستهدف (نيوك سريع للقديم)
            const channels = await destGuild.channels.fetch();
            for (const [_, channel] of channels) {
                await channel.delete().catch(() => {});
            }

            const roles = await destGuild.roles.fetch();
            for (const [_, role] of roles) {
                if (role.name !== '@everyone' && !role.managed) {
                    await role.delete().catch(() => {});
                }
            }

            // خريطة لربط الرولات القديمة بالجديدة لتطبيق البرمشنات بدقة
            const roleMap = new Map();

            // 2. نسخ الرولات
            const sourceRoles = [...(await sourceGuild.roles.fetch()).values()].sort((a, b) => a.position - b.position);
            
            for (const role of sourceRoles) {
                if (role.name === '@everyone') {
                    await destGuild.roles.everyone.setPermissions(role.permissions);
                    roleMap.set(role.id, destGuild.roles.everyone.id);
                    continue;
                }
                if (role.managed) continue;

                const newRole = await destGuild.roles.create({
                    name: role.name,
                    color: role.color,
                    hoist: role.hoist,
                    mentionable: role.mentionable,
                    permissions: role.permissions
                }).catch(() => null);

                if (newRole) roleMap.set(role.id, newRole.id);
            }

            // 3. نسخ الرومات والبرمشنات (الكاتيجوري أولاً ثم الرومات الداخلية)
            const sourceChannels = [...(await sourceGuild.channels.fetch()).values()];
            
            // ترتيب الفئات (Categories)
            const categories = sourceChannels.filter(c => c.type === 'GUILD_CATEGORY').sort((a, b) => a.position - b.position);
            const channelMap = new Map();

            for (const cat of categories) {
                // تجهيز صلاحيات الفئة
                const permissionOverwrites = cat.permissionOverwrites.cache.map(overwrite => ({
                    id: roleMap.get(overwrite.id) || overwrite.id,
                    allow: overwrite.allow,
                    deny: overwrite.deny,
                    type: overwrite.type
                })).filter(o => o.id);

                const newCat = await destGuild.channels.create(cat.name, {
                    type: 'GUILD_CATEGORY',
                    permissionOverwrites
                }).catch(() => null);

                if (newCat) channelMap.set(cat.id, newCat.id);
            }

            // نسخ الرومات (الكتابية والصوتية) داخل الفئات
            const subChannels = sourceChannels.filter(c => c.type !== 'GUILD_CATEGORY').sort((a, b) => a.position - b.position);

            for (const ch of subChannels) {
                const permissionOverwrites = ch.permissionOverwrites.cache.map(overwrite => ({
                    id: roleMap.get(overwrite.id) || overwrite.id,
                    allow: overwrite.allow,
                    deny: overwrite.deny,
                    type: overwrite.type
                })).filter(o => o.id);

                await destGuild.channels.create(ch.name, {
                    type: ch.type,
                    parent: channelMap.get(ch.parentId) || null,
                    nsfw: ch.nsfw,
                    topic: ch.topic,
                    rateLimitPerUser: ch.rateLimitPerUser,
                    userLimit: ch.userLimit,
                    bitrate: ch.bitrate,
                    permissionOverwrites
                }).catch(() => null);
            }

            client.destroy();
            return res.json({ message: 'تم نسخ الرولات، الرومات، والصلاحيات بالكامل وبنجاح التام!' });

        } catch (error) {
            client.destroy();
            return res.status(500).json({ error: 'حدث خطأ أثناء النسخ: ' + error.message });
        }
    });

    client.login(token).catch(err => {
        res.status(401).json({ error: 'التوكن المدخل غير صحيح أو انتهت صلاحيته.' });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Cloner backend running on port ${PORT}`));
