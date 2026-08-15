const fs = require('fs');
const { execSync } = require('child_process');

async function syncEnvs() {
    console.log('Reading .env file...');
    if (!fs.existsSync('.env')) {
        console.log('.env not found!');
        return;
    }

    const env = fs.readFileSync('.env', 'utf-8');
    const lines = env.split('\n');

    for (const line of lines) {
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const eqIdx = line.indexOf('=');
        if (eqIdx > 0) {
            const key = line.slice(0, eqIdx).trim();
            let val = line.slice(eqIdx + 1).trim();
            if (val.startsWith('"') && val.endsWith('"')) {
                val = val.slice(1, -1);
            } else if (val.startsWith("'") && val.endsWith("'")) {
                val = val.slice(1, -1);
            }
            
            console.log(`Syncing ${key}...`);
            try {
                // Remove existing
                execSync(`npx vercel env rm ${key} production --yes`, { stdio: 'ignore' });
            } catch (e) {
                // Ignore error if it doesn't exist
            }
            
            try {
                // Add new value using STDIN
                execSync(`npx vercel env add ${key} production`, { input: val, stdio: 'ignore' });
                console.log(`✅ Set ${key} successfully.`);
            } catch (e) {
                console.log(`❌ Failed to set ${key}: ${e.message}`);
            }
        }
    }
    console.log('✅ All environment variables synced!');
    console.log('🚀 Redeploying to apply variables...');
    try {
        execSync('npx vercel --prod --yes', { stdio: 'inherit' });
        console.log('✅ Redeployment complete!');
    } catch (e) {
        console.log('❌ Redeployment failed.');
    }
}

syncEnvs();
