export interface Adaptation {
  id: number;
  code: string;
  name: string;
}

export interface AdaptationsResponse {
  data: Adaptation[];
}

export interface KeyNode {
  id: number;
  key: string;
  code: string;
  related_keys: string | string[];
  parent_id: string | null;
  title: string;
  desc?: string; // Description field
  purpose?: string; // Purpose field
  children: KeyNode[];
  apiData?: any; // Store full API response for detailed form population
}

export interface KeysResponse {
  data: KeyNode[];
}

export interface UpdatePayload {
  code: string;
  desc: string;
  id: number;
  key: string;
  lang: string;
  purpose: string;
  related_keys: string;
  title: string;
}

export interface UpdateResponse {
  success: boolean;
  message: string;
}

export interface CreatePayload {
  adaptation_id: number;
  parent_id: number;
  title: string;
}

export interface CreateResponse {
  success: boolean;
  message: string;
  data?: any;
}

export interface KeyDataResponse {
  data: {
    id: string;
    code: string;
    key: string;
    parentKey: string;
    parent_id: string;
    related_keys: string[];
    title: string;
    translations: Array<{
      locale: string;
      title: string;
      desc: string;
      purpose: string;
    }>;
  };
}

export interface DFAHelpAdminProps {
  className?: string;
  apiBaseUrl?: string;
  bearerToken?: string;
  onUpdate?: (response: UpdateResponse) => void;
  onError?: (error: string) => void;
  showHeader?: boolean;
}
