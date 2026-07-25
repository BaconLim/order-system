import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PUSHOVER_API_TOKEN = process.env.PUSHOVER_API_TOKEN || "aj3wzurddq5iif6c3nhhzdnk78dxo5";
const PUSHOVER_USER_KEY = process.env.PUSHOVER_USER_KEY || "uxeiarrmvb8rgc4azi23bpqrzeqrkp";

export default async function handler(req, res) {
  // 跨域 CORS 處理
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. 檢查營業狀態
    const { data: setting } = await supabase.from('system_settings').select('status').eq('id', 1).single();
    if (setting && setting.status !== 'open') {
      const msgMap = {
        stop: '目前店家【暫停外送】，暫不接受下單。',
        closed: '目前店家【本日公休】，暫不接受下單。'
      };
      return res.status(400).json({ 
        status: 'error', 
        message: msgMap[setting.status] || '目前非營業時間，暫停接單。' 
      });
    }

    const data = req.body;
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    // 2. 自動生成訂單流水號 (YYYYMMDD-0001)
    const { data: todayOrders } = await supabase
      .from('orders')
      .select('order_id')
      .gte('created_at', new Date().toISOString().slice(0, 10))
      .order('created_at', { ascending: false })
      .limit(1);

    let sequence = 1;
    if (todayOrders && todayOrders.length > 0) {
      const lastSeq = parseInt(todayOrders[0].order_id.split('-')[1], 10);
      if (!isNaN(lastSeq)) sequence = lastSeq + 1;
    }
    const orderId = `${todayStr}-${String(sequence).padStart(4, '0')}`;

    // 格式化餐點明細文字
    const itemsStr = (data.items || []).map(item => `🍱 ${item.qty} x ${item.name}`).join('\n');

    // 3. 寫入 Supabase 訂單表
    const { error: insertError } = await supabase.from('orders').insert([{
      order_id: orderId,
      unit: data.unit || '',
      name: data.name || '訪客',
      phone: data.phone || '',
      address: data.address || '',
      delivery_time: data.time || '',
      items_text: itemsStr,
      items_json: data.items || [],
      total_price: data.totalPrice || 0,
      remark: data.remark || ''
    }]);

    if (insertError) throw insertError;

    // 4. 發送 Pushover 推播 (乾淨純文字訊息)
    if (PUSHOVER_USER_KEY && PUSHOVER_API_TOKEN) {
      const shortId = orderId.slice(-4);
      const pushoverMsg = 
        `🆔 <b>單號:</b> ${shortId}\n` +
        `👤 <b>人名:</b> ${data.name || '訪客'}\n` +
        `📞 <b>電話:</b> ${data.phone || '無'}\n` +
        `🏢 <b>單位:</b> ${data.unit || '無'}\n` +
        `📍 <b>地址:</b> ${data.address || '無'}\n` +
        `⏰ <b>時間:</b> ${data.time || '無'}\n` +
        `----------------\n` +
        `${itemsStr}\n` +
        `----------------\n` +
        `💰 <b>金額:</b> $${data.totalPrice || 0}\n` +
        `💬 <b>備註:</b> ${data.remark || '無'}`;

      await fetch('https://api.pushover.net/1/messages.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: PUSHOVER_API_TOKEN,
          user: PUSHOVER_USER_KEY,
          title: `🥗 新訂單 #${shortId}`,
          message: pushoverMsg,
          html: '1',
          sound: 'cashregister'
        })
      });
    }

    // 5. 隨機抽笑話回傳
    let randomJoke = '';
    const { data: jokes } = await supabase.from('jokes').select('content');
    if (jokes && jokes.length > 0) {
      randomJoke = jokes[Math.floor(Math.random() * jokes.length)].content;
    }

    return res.status(200).json({ status: 'success', message: '訂單寫入成功', orderId, joke: randomJoke });

  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}
