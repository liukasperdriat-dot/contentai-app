const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const PLAN_LIMITS = {
  free: 5,
  pro: 100,
  agence: Infinity
};

function verifyToken(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    if (decoded.exp < Date.now()) return null;
    return decoded.userId;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Vérifier le token
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Connexion requise', code: 'AUTH_REQUIRED' });

  const token = authHeader.replace('Bearer ', '');
  const userId = verifyToken(token);
  if (!userId) return res.status(401).json({ error: 'Session expirée', code: 'TOKEN_EXPIRED' });

  // Récupérer l'utilisateur
  const userRes = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${userId}&select=*`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
    }
  });
  const users = await userRes.json();
  if (!users.length) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const user = users[0];

  // Réinitialiser le compteur si nouveau mois
  const resetDate = new Date(user.generations_reset_at);
  const now = new Date();
  if (now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear()) {
    await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      },
      body: JSON.stringify({ generations_used: 0, generations_reset_at: now.toISOString() })
    });
    user.generations_used = 0;
  }

  // Vérifier la limite
  const limit = PLAN_LIMITS[user.plan] || 5;
  if (user.generations_used >= limit) {
    return res.status(403).json({
      error: `Limite atteinte (${limit} générations/mois)`,
      code: 'LIMIT_REACHED',
      plan: user.plan
    });
  }

  // Appeler Claude
  const apiKey = process.env.ANTHROPIC_API_KEY;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();

    // Incrémenter le compteur
    await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      },
      body: JSON.stringify({ generations_used: user.generations_used + 1 })
    });

    res.status(response.status).json(data);

  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur: ' + err.message });
  }
}
