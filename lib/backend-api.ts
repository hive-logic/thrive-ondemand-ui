const AGENT_HOST = (typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_AGENT_HOST) || "";
const API_BASE_URL = `https://${AGENT_HOST}`;

export async function checkUserId(activityId: string, email: string): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/check_user_id?activity=${activityId}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        activity_id: activityId,
        user_email: email,
      }),
    });

    if (!response.ok) {
      console.error('Check User ID failed:', response.statusText);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Check User ID error:', error);
    return null;
  }
}

export async function createUser(
  activityId: string,
  name: string,
  email: string,
  details: Record<string, unknown>,
  subscription: PushSubscriptionJSON | null
): Promise<string | null> {
  const url = `${API_BASE_URL}/v1/create_user?activity=${activityId}`;
  const payload = {
    activity_id: activityId,
    name,
    email,
    details,
    subscription,
  };
  
  console.log('[createUser] Sending request to:', url);
  console.log('[createUser] Payload:', JSON.stringify(payload, null, 2));
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    console.log('[createUser] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[createUser] Failed:', response.status, errorText);
      return null;
    }

    const responseText = await response.text();
    console.log('[createUser] Response body:', responseText);
    
    // Try to parse as JSON, if it fails treat as plain string UUID
    try {
      const data = JSON.parse(responseText);
      if (typeof data === 'string') return data;
      const userId = data.user_id ?? data.userId ?? data.id ?? data.uuid ?? null;
      return typeof userId === 'string' ? userId : null;
    } catch {
      // Response is plain string (UUID)
      return responseText.trim() || null;
    }
  } catch (error) {
    console.error('[createUser] Error:', error);
    return null;
  }
}

export async function saveSubscription(activityId: string, userId: string, subscription: PushSubscription | PushSubscriptionJSON) {
  const subscriptionData = 'toJSON' in subscription && typeof subscription.toJSON === 'function' 
    ? subscription.toJSON() 
    : subscription;

  console.log('[saveSubscription] Sending request for user:', userId);

  try {
    const response = await fetch(`${API_BASE_URL}/v1/save_subscription?activity=${activityId}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        subscription: subscriptionData,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[saveSubscription] Failed:', response.status, errorText);
      throw new Error(`Save Subscription failed: ${response.status}`);
    }

    console.log('[saveSubscription] Success for user:', userId);
  } catch (error) {
    console.error('[saveSubscription] Error:', error);
    throw error;
  }
}

export async function fetchQuickActionsData(customerId: string, accessToken: string): Promise<Record<string, any> | null> {
  console.log('[fetchQuickActionsData] Fetching for customer:', customerId);
  try {
    const url = `${API_BASE_URL}/v1/quick_actions_data?customer_id=${encodeURIComponent(customerId)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error('[fetchQuickActionsData] Failed:', response.status);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[fetchQuickActionsData] Error:', error);
    return null;
  }
}

export async function fetchAccessZones(customerId: string, accessToken: string): Promise<{ access_zones: any[] } | null> {
  try {
    const url = `${API_BASE_URL}/v1/access_zones?customer_id=${encodeURIComponent(customerId)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export type LiveAlert = {
  id: string;
  title: string;
  description?: string;
  location?: string;
  observed_location?: string;
  protocol_type?: string;
  severity?: string;
  reporter_name?: string;
  reporter_email?: string;
  activity_name?: string;
  date_created?: string;
  user_gps_coordinates?: string;
  seen_by?: string[];
  notification_id?: string;
  source?: string;
};

export async function fetchLiveAlerts(customerId: string, accessToken: string): Promise<LiveAlert | null> {
  try {
    const url = `${API_BASE_URL}/v1/last_event_alert`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ customer_id: customerId }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    if (data && data.id && !data.error) {
      return {
        ...data,
        title: data.title || 'Event Alert',
        date_created: data.date_created || new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchLastNotification(customerId: string, accessToken: string): Promise<LiveAlert | null> {
  try {
    const url = `${API_BASE_URL}/v1/last_alert`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ customer_id: customerId }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    if (data && data.id && !data.error) {
      return {
        id: `notif_${data.id}`,
        title: data.rule_name || 'Alert',
        description: data.message || '',
        location: data.site_name || '',
        severity: 'high',
        date_created: data.date_created || new Date().toISOString(),
        seen_by: data.seen_by || [],
        source: 'notification',
        notification_id: data.id,
      };
    }
    return null;
  } catch {
    return null;
  }
}


export async function markAlertSeen(notificationId: string, userId: string, customerId: string, accessToken: string): Promise<boolean> {
  try {
    const url = `${API_BASE_URL}/v1/mark_event_alert_seen`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ notification_id: notificationId, user_id: userId, customer_id: customerId }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
