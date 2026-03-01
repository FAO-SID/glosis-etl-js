/**
 * SQL queries for the Data Viewer — ported from dataviewer/server.R
 */

export const QUERY_LOCATION_DATA = `
  SELECT 
    pr.name AS project_name, 
    s.site_code, 
    opc.property_phys_chem_id, 
    e.element_id, 
    p.profile_code,
    e.profile_id, 
    e.order_element, 
    e.upper_depth, 
    e.lower_depth, 
    e.type, 
    spc.code, 
    ST_X(pl.position::geometry) AS longitude, 
    ST_Y(pl.position::geometry) AS latitude 
  FROM 
    core.result_phys_chem rpc
  JOIN core.element e ON rpc.specimen_id = e.element_id
  JOIN core.profile p ON e.profile_id = p.profile_id
  JOIN core.plot pl ON p.plot_id = pl.plot_id
  JOIN core.site s ON pl.site_id = s.site_id
  JOIN core.project_site sp ON s.site_id = sp.site_id
  JOIN core.project pr ON sp.project_id = pr.project_id
  JOIN core.observation_phys_chem opc ON rpc.observation_phys_chem_id = opc.observation_phys_chem_id
  JOIN core.specimen spc ON rpc.specimen_id = spc.specimen_id;
`;

export const QUERY_PROPERTY_DATA = `
  SELECT 
    pr.name AS project_name, 
    s.site_code, 
    rpc.result_phys_chem_id, 
    rpc.value, 
    opc.property_phys_chem_id, 
    opc.procedure_phys_chem_id,
    sp.code, 
    e.element_id,
    p.profile_code,
    e.profile_id, 
    ST_X(pl.position::geometry) AS longitude, 
    ST_Y(pl.position::geometry) AS latitude 
  FROM 
    core.result_phys_chem rpc
  JOIN core.specimen sp ON rpc.specimen_id = sp.specimen_id
  JOIN core.element e ON sp.element_id = e.element_id
  JOIN core.profile p ON e.profile_id = p.profile_id
  JOIN core.plot pl ON p.plot_id = pl.plot_id
  JOIN core.site s ON pl.site_id = s.site_id
  JOIN core.project_site sp2 ON s.site_id = sp2.site_id
  JOIN core.project pr ON sp2.project_id = pr.project_id
  JOIN core.observation_phys_chem opc ON rpc.observation_phys_chem_id = opc.observation_phys_chem_id;
`;
