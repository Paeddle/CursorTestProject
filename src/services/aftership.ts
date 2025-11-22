// AfterShip API Integration
// Get your API key from: https://accounts.aftership.com/register

const AFTERSHIP_API_KEY = import.meta.env.VITE_AFTERSHIP_API_KEY || '';
const AFTERSHIP_API_URL = 'https://api.aftership.com/v4';

export interface TrackingInfo {
  id: string;
  tracking_number: string;
  slug: string;
  tag: string;
  tracking_postal_code?: string;
  tracking_ship_date?: string;
  tracking_account_number?: string;
  tracking_destination_country?: string;
  tracking_key?: string;
  title?: string;
  order_id?: string;
  order_id_path?: string;
  customer_name?: string;
  custom_fields?: Record<string, any>;
  order_promised_delivery_date?: string;
  delivery_type?: string;
  origin_country_iso3?: string;
  origin_state?: string;
  origin_city?: string;
  origin_raw_location?: string;
  destination_country_iso3?: string;
  destination_state?: string;
  destination_city?: string;
  destination_raw_location?: string;
  last_updated_at?: string;
  checkpoints?: Checkpoint[];
}

export interface Checkpoint {
  slug: string;
  city?: string;
  created_at: string;
  country_name?: string;
  message: string;
  state?: string;
  tag: string;
  zip?: string;
  location?: string;
}

export interface TrackingResponse {
  tracking: TrackingInfo;
}

export interface TrackingsResponse {
  trackings: TrackingInfo[];
  total: number;
}

class AfterShipService {
  private apiKey: string;

  constructor() {
    this.apiKey = AFTERSHIP_API_KEY;
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    if (!this.apiKey) {
      throw new Error('AfterShip API key is not configured. Please set VITE_AFTERSHIP_API_KEY in your .env file');
    }

    const response = await fetch(`${AFTERSHIP_API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'aftership-api-key': this.apiKey,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.meta?.message || error.message || `API error: ${response.status}`);
    }

    return response.json();
  }

  async createTracking(
    trackingNumber: string,
    slug?: string,
    title?: string
  ): Promise<TrackingInfo> {
    const payload: any = {
      tracking: {
        tracking_number: trackingNumber,
      },
    };

    if (slug) payload.tracking.slug = slug;
    if (title) payload.tracking.title = title;

    const response = await this.request('/trackings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return response.data.tracking;
  }

  async getAllTrackings(): Promise<TrackingInfo[]> {
    const response = await this.request('/trackings');
    return response.data.trackings || [];
  }

  async getTracking(trackingNumber: string, slug?: string): Promise<TrackingInfo> {
    const params = slug ? `?slug=${slug}` : '';
    const response = await this.request(`/trackings/${slug || 'none'}/${trackingNumber}${params}`);
    return response.data.tracking;
  }

  async deleteTracking(trackingNumber: string, slug?: string): Promise<void> {
    const slugParam = slug || 'none';
    await this.request(`/trackings/${slugParam}/${trackingNumber}`, {
      method: 'DELETE',
    });
  }

  async retrack(trackingNumber: string, slug?: string): Promise<TrackingInfo> {
    const slugParam = slug || 'none';
    const response = await this.request(`/trackings/${slugParam}/${trackingNumber}/retrack`, {
      method: 'POST',
    });
    return response.data.tracking;
  }
}

export const aftershipService = new AfterShipService();

