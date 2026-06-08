export interface CatalogItem {
  Id: string;
  Name: string;
  Path: string;
  Type: 'PowerBIReport' | 'Report' | string;
}

export interface ExportJob {
  Id: string;
  Status: 'InProgress' | 'Succeeded' | 'Failed';
  PercentComplete?: number;
}
