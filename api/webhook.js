const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const payload = req.body;
  const eventType = payload.type;

  try {
    if (eventType === 'checkout.session.completed') {
      const session = payload.data.object;
      const email = session.customer_details?.email;
      const subscriptionId = session.subscription;

      // Déterminer le plan selon le montant
      const amount = session.amount_total;
      const plan = amount >= 4900 ? 'agence' : 'pro';

      // Mettre à jour le plan dans Supabase
      await fetch(`${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        },
        body: JSON.stringify({
          plan,
          stripe_subscription_id: subscriptionId,
          generations_used: 0,
          generations_reset_at: new Date().toISOString()
        })
      });
    }

    if (eventType === 'customer.subscription.deleted') {
      const subscription = payload.data.object;
      const subscriptionId = subscription.id;

      // Repasser en plan gratuit
      await fetch(`${SUPABASE_URL}/rest/v1/users?stripe_subscription_id=eq.${subscriptionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        },
        body: JSON.stringify({ plan: 'free', stripe_subscription_id: null })
      });
    }

    res.status(200).json({ received: true });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
