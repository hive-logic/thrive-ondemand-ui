const API_BASE_URL = 'https://agent.thrivelogic.ai';

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
    return data; // API direkt string (UUID) mi dönüyor yoksa JSON obje mi? Şimdilik data diyelim.
  } catch (error) {
    console.error('Check User ID error:', error);
    return null;
  }
}

export async function saveSubscription(activityId: string, userId: string, subscription: PushSubscription | PushSubscriptionJSON) {
  try {
    const subscriptionData = 'toJSON' in subscription && typeof subscription.toJSON === 'function' 
      ? subscription.toJSON() 
      : subscription;

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
      console.error('Save Subscription failed:', response.status, errorText);
      throw new Error(`Save Subscription failed: ${response.status}`);
    }

    console.log('Push subscription saved to backend for user:', userId);
  } catch (error) {
    console.error('Save Subscription error:', error);
  }
}

