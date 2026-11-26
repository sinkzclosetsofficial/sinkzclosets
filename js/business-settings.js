/* SINKZCLOSETS public business contact/payment settings */
(function () {
  "use strict";
  const URL = "https://mpzkiatdejirrjidkdqi.supabase.co";
  const KEY = "sb_publishable_9Lpund59NwZAcpZyiCdxPg_D8fohkXR";
  let client = null;
  let cache = null;
  async function load() {
    if (cache) return cache;
    if (!window.supabase?.createClient) return null;
    client = client || window.supabase.createClient(URL, KEY);
    const { data, error } = await client
      .from("business_contact_payment_settings")
      .select("setting_type,provider,label,phone_number,email_address,recipient_name,app_url,display_order")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("display_order", { ascending: true });
    if (error) throw error;
    cache = data || [];
    return cache;
  }
  window.SinkzBusinessSettings = { load };
})();