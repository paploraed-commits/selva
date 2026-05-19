const express = require('express');
const { Client } = require('discord.js-selfbot-v13');

const app = express();

// إعداد ترويسات الـ CORS يدوياً لضمان قبول الطلبات من GitHub Pages بدون مشاكل
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    
    // التعامل مع طلبات التمهيد (Preflight Requests)
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());

// مسار فحص حالة السيرفر للتأكد من أنه يعمل
app.get('/', (req, res) => {
    res.send('Selva Cloner Backend is Online!');
});

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
                return res.status(404).json({ error: 'تعذر العثور على السيرفر المصدر أو الهدف.' });
            }

            // تنظيف الرومات القديمة بالسيرفر المستهدف
            const channels = await destGuild.channels.fetch();
            for (const [_, channel] of channels) {
                await channel.delete().catch(() => {});
            }

            // تنظيف الرولات القديمة
            const roles = await destGuild.roles.fetch();
            for (const [_, role] of roles) {
                if (role.name !== '@everyone' && !role.managed) {
                    await role.delete().catch(() => {});
                }
            }

            const roleMap = new Map();
            const sourceRoles = [...(await sourceGuild.roles.fetch()).values()].sort((a, b) => a.position - b.position);
            
            for (const role of sourceRoles) {
                if (role.name === '@everyone') {
                    await destGuild.roles.everyone.setPermissions(role.permissions).catch(() => {});
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

            const sourceChannels = [...(await sourceGuild.channels.fetch()).values()];
            const categories = sourceChannels.filter(c => c.type === 'GUILD_CATEGORY').sort((a, b) => a.position - b.position);
            const channelMap = new Map();

            for (const cat of categories) {
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
            return res.json({ message: 'تمت عملية محاكاة ونسخ السيرفر بالكامل بنجاح!' });

        } catch (error) {
            client.destroy();
            return res.status(500).json({ error: 'حدث خطأ غير متوقع: ' + error.message });
        }
    });

    client.login(token).catch(err => {
        res.status(401).json({ error: 'التوكن المرفق غير صالح أو منتهي الصلاحية.' });
    });
});

// تعيين المنفذ المتوافق مع خوادم Render تلقائياً
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Backend service listening on port ${PORT}`));
