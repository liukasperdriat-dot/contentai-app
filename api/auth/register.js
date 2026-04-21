import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'contentai_salt').digest('hex');
}

function generateToken(userId) {
  return Buffer.from(JSON.stringify({ userId, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (min 6 caractères)' });

  const passwordHash = hashPassword(password);

  const response = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ email, password_hash: passwordHash, plan: 'free' })
  });

  if (response.status === 409) return res.status(409).json({ error: 'Cet email est déjà utilisé' });
  if (!response.ok) return res.status(400).json({ error: 'Erreur lors de la création du compte' });

  const [user] = await response.json();
  const token = generateToken(user.id);

  res.status(201).json({ token, user: { id: user.id, email: user.email, plan: user.plan } });
}
