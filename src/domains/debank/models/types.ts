export interface DeBankProtocolPortfolio {
  chain: string;
  name: string;
  portfolio_item_list?: Array<{
    stats?: {
      asset_usd_value?: number;
      debt_usd_value?: number;
      net_usd_value?: number;
    };
  }>;
}

export interface DeBankProtocolPosition {
  id: string;
  chain: string;
  name: string;
  logo_url?: string;
  has_supported_portfolio?: boolean;
  tvl?: number;
  portfolio_item_list?: DeBankProtocolPortfolio['portfolio_item_list'];
}

export interface DeBankProtocolQueryResult {
  protocols: DeBankProtocolPosition[];
  fromCache: boolean;
  cachedAt?: string;
}

export interface DeBankTokenPosition {
  id?: string;
  chain?: string;
  symbol?: string;
  name?: string;
  amount?: number;
  price?: number;
  usd_value?: number;
  logo_url?: string;
}

export interface DeBankTokenQueryResult {
  tokens: DeBankTokenPosition[];
  fromCache: boolean;
  cachedAt?: string;
}
