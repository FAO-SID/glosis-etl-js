// =============================================================================
// TABLE DEFINITIONS — Column name arrays from global.R Section 7
// =============================================================================

/** Plot Data sheet column names (60 columns) */
export const PLOT_TABLE_NAMES = [
  "project_name", "site_code", "plot_code", "profile_code",
  "plot_type", "n_layers", "date", "longitude", "latitude",
  "altitude", "positional_accuracy", "extent", "map_sheet_code",
  "TemperatureRegime", "MoistureRegime", "KoeppenClass",
  "CurrentWeatherConditions", "PastWeatherConditions",
  "Landuse", "Vegetation", "Croptype", "BareSoilAbundance",
  "TreeDensity", "ForestAbundance",
  "GrassAbundance", "ShrubAbundace", "HumanInfluence", "PavedAbundance",
  "SurfaceAge", "ParentMaterialClass", "Lithology", "MajorLandForm",
  "ComplexLandform", "Position", "SlopeForm", "SlopeGradient",
  "SlopeOrientation", "SlopePathway", "RockOutcropsCover", "RockOutcropsDistance",
  "FragmentsCover", "FragmentsSize", "ErosionClass", "ErosionDegree",
  "ErosionAreaAffected", "ErosionActivityPeriod", "SealingThickness", "SealingConsistence",
  "CracksWidth", "CracksDepth", "CracksDistance", "SaltCover",
  "SaltThickness", "BleachedSandCover", "PresenceOfWater", "MoistureConditions",
  "DrainageClass", "ExternalDrainageClass", "GroundwaterDepth", "GroundwaterQuality",
  "FloodDuration", "FloodFrequency",
] as const;

/** Profile Data sheet column names (12 columns) */
export const PROFILE_TABLE_NAMES = [
  "profile_code", "descriptionStatus", "soilGroupWRB", "soilClassificationWRB",
  "SoilSpecifierWRB", "SupplementaryQualifierWRB", "soilPhase",
  "soilOrderUSDA", "soilSuborderUSDA", "formativeElementUSDA",
  "SoilDepthtoBedrock", "EffectiveSoilDepth",
] as const;

/** Element Data sheet column names (75 columns) */
export const ELEMENT_TABLE_NAMES = [
  "profile_code", "element_code", "type", "order_element", "upper_depth", "lower_depth",
  "horizon_code", "BoundaryDistinctness", "BoundaryTopography",
  "SoilTexture", "SandfractionTexture", "FieldTexture",
  "Rockabundance", "Rocksize", "RockShape",
  "Rockweathering", "RockPrimary", "RockNature",
  "PeaDescomposition", "AeromorphicForest", "ColourMoist",
  "ColourDry", "MottlesColour", "MottlesAbundance",
  "MottlesSize", "MottlesContrast", "MottlesBoundary",
  "RedoxPotential", "ReducingConditions", "CarbonateContent",
  "CarbonateForms", "GypsumContent", "GypsumForms",
  "SaltContent", "FieldPH", "SoilOdour",
  "AndicCharacteristics", "OrganicMatter", "StructureGrade",
  "StructureType", "StructureSize", "ConsistenceDry",
  "ConsistenceMoist", "ConsistenceWet", "Stickiness",
  "Plasticity", "Moisture", "BulkDensity",
  "PeatDrainage", "PeatVolume", "PeatBulkDensity",
  "PorosityAbundance", "PorosityType", "PorositySize",
  "PoreAbundance", "CoatingsAbundance", "CoatingsContrast",
  "CoatingsNature", "CoatingsForm", "CoatingsLocation",
  "Cementation/compactionContinuity", "Cementation/compactionStructure", "Cementation/compactionNature",
  "Cementation/compactionDegree", "MineralConcentrationsAbundance", "MineralConcentrationsKind",
  "MineralConcentrationsSize", "MineralConcentrationsShape", "MineralConcentrationsHardness",
  "MineralConcentrationsNature", "MineralConcentrationsColour", "RootsSize",
  "RootsAbundance", "BiologicalAbundance", "BiologicalKind",
  "ArtefactAbundance", "ArtefactKind", "ArtefactSize",
  "ArtefactHardness", "ArtefactWeathering", "ArtefactColour",
] as const;

/** Descriptive plot properties (for pivot to result_desc_plot) */
export const PLOT_DESC_PROPERTIES = [
  "TemperatureRegime", "MoistureRegime", "KoeppenClass", "CurrentWeatherConditions", "PastWeatherConditions",
  "Landuse", "Vegetation", "Croptype", "BareSoilAbundance", "TreeDensity", "ForestAbundance",
  "GrassAbundance", "ShrubAbundace", "HumanInfluence", "PavedAbundance",
  "SurfaceAge", "ParentMaterialClass", "Lithology", "MajorLandForm",
  "ComplexLandform", "Position", "SlopeForm", "SlopeGradient",
  "SlopeOrientation", "SlopePathway", "RockOutcropsCover", "RockOutcropsDistance",
  "FragmentsCover", "FragmentsSize", "ErosionClass", "ErosionDegree",
  "ErosionAreaAffected", "ErosionActivityPeriod", "SealingThickness", "SealingConsistence",
  "CracksWidth", "CracksDepth", "CracksDistance", "SaltCover",
  "SaltThickness", "BleachedSandCover", "PresenceOfWater", "MoistureConditions",
  "DrainageClass", "ExternalDrainageClass", "GroundwaterDepth", "GroundwaterQuality",
  "FloodDuration", "FloodFrequency",
] as const;

/** Profile descriptive properties (for pivot to result_desc_profile) */
export const PROFILE_DESC_PROPERTIES = [
  "descriptionStatus", "soilGroupWRB", "soilClassificationWRB",
  "SoilSpecifierWRB", "SupplementaryQualifierWRB", "soilPhase",
  "soilOrderUSDA", "soilSuborderUSDA", "formativeElementUSDA",
  "SoilDepthtoBedrock", "EffectiveSoilDepth",
] as const;

/** Element descriptive properties (for pivot to result_desc_element) */
export const ELEMENT_DESC_PROPERTIES = [
  "BoundaryDistinctness", "BoundaryTopography", "SoilTexture", "SandfractionTexture", "FieldTexture",
  "Rockabundance", "Rocksize", "RockShape", "Rockweathering", "RockPrimary", "RockNature",
  "PeaDescomposition", "AeromorphicForest", "ColourMoist", "ColourDry", "MottlesColour",
  "MottlesAbundance", "MottlesSize", "MottlesContrast", "MottlesBoundary", "RedoxPotential",
  "ReducingConditions", "CarbonateContent", "CarbonateForms", "GypsumContent", "GypsumForms",
  "SaltContent", "FieldPH", "SoilOdour", "AndicCharacteristics", "OrganicMatter",
  "StructureGrade", "StructureType", "StructureSize", "ConsistenceDry", "ConsistenceMoist",
  "ConsistenceWet", "Stickiness", "Plasticity", "Moisture", "BulkDensity", "PeatDrainage",
  "PeatVolume", "PeatBulkDensity", "PorosityAbundance", "PorosityType", "PorositySize",
  "PoreAbundance", "CoatingsAbundance", "CoatingsContrast", "CoatingsNature", "CoatingsForm",
  "CoatingsLocation", "Cementation/compactionContinuity", "Cementation/compactionStructure",
  "Cementation/compactionNature", "Cementation/compactionDegree", "MineralConcentrationsAbundance",
  "MineralConcentrationsKind", "MineralConcentrationsSize", "MineralConcentrationsShape",
  "MineralConcentrationsHardness", "MineralConcentrationsNature", "MineralConcentrationsColour",
  "RootsSize", "RootsAbundance", "BiologicalAbundance", "BiologicalKind",
  "ArtefactAbundance", "ArtefactKind", "ArtefactSize", "ArtefactHardness",
  "ArtefactWeathering", "ArtefactColour",
] as const;

/** Tab groups for the data viewer UI */
export const TAB_GROUPS = [
  {
    label: "Project & Site",
    icon: "🏗️",
    tables: [
      { label: "Project", schema: "core", table: "project" },
      { label: "Site", schema: "core", table: "site" },
      { label: "Site Project", schema: "core", table: "project_site" },
      { label: "Project Related", schema: "core", table: "project_related" },
    ],
  },
  {
    label: "Plot",
    icon: "🗺️",
    tables: [
      { label: "Plot", schema: "core", table: "plot" },
      { label: "Plot Individual", schema: "core", table: "plot_individual" },
      { label: "Property Desc", schema: "core", table: "property_desc" },
      { label: "Observation Desc Plot", schema: "core", table: "observation_desc_plot" },
      { label: "Category Desc", schema: "core", table: "category_desc" },
      { label: "Result Desc Plot", schema: "core", table: "result_desc_plot" },
    ],
  },
  {
    label: "Surface",
    icon: "🛤️",
    tables: [
      { label: "Surface", schema: "core", table: "surface" },
      { label: "Surface Individual", schema: "core", table: "surface_individual" },
      { label: "Result Desc Surface", schema: "core", table: "result_desc_surface" },
    ],
  },
  {
    label: "Profile",
    icon: "📊",
    tables: [
      { label: "Profile", schema: "core", table: "profile" },
      { label: "Observation Desc Profile", schema: "core", table: "observation_desc_profile" },
      { label: "Result Desc Profile", schema: "core", table: "result_desc_profile" },
    ],
  },
  {
    label: "Element",
    icon: "↕️",
    tables: [
      { label: "Element", schema: "core", table: "element" },
      { label: "Observation Desc Element", schema: "core", table: "observation_desc_element" },
      { label: "Result Desc Element", schema: "core", table: "result_desc_element" },
    ],
  },
  {
    label: "Specimen",
    icon: "🧪",
    tables: [
      { label: "Specimen", schema: "core", table: "specimen" },
      { label: "Specimen Prep Process", schema: "core", table: "specimen_prep_process" },
      { label: "Specimen Transport", schema: "core", table: "specimen_transport" },
      { label: "Specimen Storage", schema: "core", table: "specimen_storage" },
      { label: "Result Phys Chem", schema: "core", table: "result_phys_chem" },
    ],
  },
  {
    label: "Lab Descriptors",
    icon: "🧬",
    tables: [
      { label: "Observation Phys Chem", schema: "core", table: "observation_phys_chem" },
      { label: "Property Phys Chem", schema: "core", table: "property_phys_chem" },
      { label: "Procedure Phys Chem", schema: "core", table: "procedure_phys_chem" },
      { label: "Unit of Measure", schema: "core", table: "unit_of_measure" },
    ],
  },
  {
    label: "Spectral Data",
    icon: "📈",
    tables: [
      { label: "Sensor", schema: "core", table: "result_spectrum" },
    ],
  },
  {
    label: "VCard",
    icon: "👤",
    tables: [
      { label: "Organisation", schema: "metadata", table: "organisation" },
      { label: "Organisation Unit", schema: "metadata", table: "organisation_unit" },
      { label: "Organisation Individual", schema: "metadata", table: "organisation_individual" },
      { label: "Individual", schema: "metadata", table: "individual" },
      { label: "Address", schema: "metadata", table: "address" },
    ],
  },
] as const;
