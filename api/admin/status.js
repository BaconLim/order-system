import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET: 查詢目前營業狀態
  if (req.method === 'GET') {
    try {
      const { data } = await supabase.from('system_settings').select('status').eq('id', 1).single();
      return res.status(200).json({ status: data?.status || 'open' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST: 管理員切換營業狀態
  if (req.method === 'POST') {
    const { status, adminPassword } = req.body;
    
    // 檢查管理員密碼 (預設為 1234，可由環境變數 ADMIN_PASSWORD 蓋過)
    const expectedPassword = process.env.ADMIN_PASSWORD || '1234';
    if (adminPassword !== expectedPassword) {
      return res.status(401).json({ error: '管理員密碼錯誤' });
    }

    if (!['open', 'stop', 'closed'].includes(status)) {
      return res.status(400).json({ error: '狀態名稱無效' });
    }

    try {
      const { error } = await supabase
        .from('system_settings')
        .update({ status, updated_at: new Date() })
        .eq('id', 1);

      if (error) throw error;

      return res.status(200).json({ success: true, status });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
