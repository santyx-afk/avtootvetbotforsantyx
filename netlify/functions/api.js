const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { type } = body;

  try {
    if (type === 'create') {
      let { order_id, amount, url, post } = body;
      amount = Number(amount);
      let uniqueAmount = amount;
      const originalAmount = amount;

      // Check for uniqueness within the last 900 seconds for active checks
      let isUnique = false;
      let attempts = 0;
      
      while (!isUnique && attempts < 10) {
        const timeLimit = new Date(Date.now() - 900 * 1000).toISOString();
        
        const { data, error } = await supabase
          .from('checks')
          .select('id')
          .eq('status', 'active')
          .eq('amount', uniqueAmount)
          .gte('created_at', timeLimit)
          .limit(1);
          
        if (error) throw error;
        
        if (data && data.length > 0) {
          // Conflict found, generate new amount by adding 1-99
          uniqueAmount = amount + Math.floor(Math.random() * 99) + 1;
          attempts++;
        } else {
          isUnique = true;
        }
      }

      if (!isUnique) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Could not generate unique amount' }) };
      }

      const check_code = crypto.randomUUID();
      const payload = {
        check_code,
        order_id,
        original_amount: originalAmount,
        amount: uniqueAmount,
        url,
        post: typeof post === 'object' ? JSON.stringify(post) : post,
        status: 'active'
      };

      const { error: insertError } = await supabase
        .from('checks')
        .insert([payload]);

      if (insertError) throw insertError;

      return {
        statusCode: 200,
        body: JSON.stringify({
          check_code,
          original_amount: originalAmount,
          amount: uniqueAmount,
          status: 'active'
        })
      };
    } 
    else if (type === 'checking') {
      const { check_code } = body;
      
      const { data, error } = await supabase
        .from('checks')
        .select('*')
        .eq('check_code', check_code)
        .single();
        
      if (error || !data) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Check not found' }) };
      }

      let currentStatus = data.status;
      
      if (currentStatus === 'active') {
        const createdAt = new Date(data.created_at).getTime();
        const now = Date.now();
        if ((now - createdAt) > 900 * 1000) {
          // Expired
          const { error: updateError } = await supabase
            .from('checks')
            .update({ status: 'expired' })
            .eq('id', data.id);
            
          if (!updateError) {
            currentStatus = 'expired';
          }
        }
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          check_code: data.check_code,
          status: currentStatus,
          amount: data.amount
        })
      };
    } 
    else {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid type' }) };
    }
  } catch (error) {
    console.error('API Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
