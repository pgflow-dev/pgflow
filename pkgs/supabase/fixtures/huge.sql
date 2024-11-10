set search_path to pgflow;

delete from pgflow.step_states where flow_slug = 'huge';
delete from pgflow.runs where flow_slug = 'huge';
delete from pgflow.deps where flow_slug = 'huge';
delete from pgflow.steps where flow_slug = 'huge';
delete from pgflow.flows where flow_slug = 'huge';

insert into pgflow.flows (flow_slug) values ('huge');

-- Flow: huge
--
--                                          start
--                                            |
--                                      parse_question
--                                            |
--                                     determine_type
--                                            |
--           ------------------------------------------------------------------------------------
--          |             |                |                   |                   |             |
--  criminal_law_route  civil_law_route  tax_law_route  intellectual_property_route  ...  constitutional_law_route
--          |             |                |                   |                               |
--     case_retrieval   precedent_analysis  regulation_check    patent_search                 bill_of_rights_analysis
--          |             |                |                   |                               |
--   evidence_analysis  liability_assessment deduction_calc  prior_art_analysis             judicial_precedents_review
--          |             |                |                   |                               |
--  statute_interpretation damages_estimation compliance_review infringement_analysis        constitutional_amendments_check
--          |             |                |                   |                               |
--     plea_options    settlement_options filing_guidelines legal_defense_strategy          separation_of_powers_assessment
--          |             |                |                   |                               |
--          |-------------|-----------------|-------------------|-------------------------------|
--                                            |
--                                    consolidate_findings
--                                            |
--                               generate_preliminary_report
--                                            |
--             ------------------------------------------------------------------
--            |                     |                     |                     |
--     legal_review  client_confidentiality_check  risk_assessment  additional_consultation
--            |                     |                     |                     |
--             \                     |                     /                     /
--                                finalize_response
--                                        |
--                                      finish

-- Insert steps
insert into pgflow.steps (flow_slug, step_slug) values
('huge', 'start'),
('huge', 'parse_question'),
('huge', 'determine_type'),

('huge', 'criminal_law_route'),
('huge', 'case_retrieval'),
('huge', 'evidence_analysis'),
('huge', 'statute_interpretation'),
('huge', 'plea_options'),

('huge', 'civil_law_route'),
('huge', 'precedent_analysis'),
('huge', 'liability_assessment'),
('huge', 'damages_estimation'),
('huge', 'settlement_options'),

('huge', 'tax_law_route'),
('huge', 'regulation_check'),
('huge', 'deduction_calculation'),
('huge', 'compliance_review'),
('huge', 'filing_guidelines'),

('huge', 'intellectual_property_route'),
('huge', 'patent_search'),
('huge', 'prior_art_analysis'),
('huge', 'infringement_analysis'),
('huge', 'legal_defense_strategy'),

('huge', 'constitutional_law_route'),
('huge', 'bill_of_rights_analysis'),
('huge', 'judicial_precedents_review'),
('huge', 'constitutional_amendments_check'),
('huge', 'separation_of_powers_assessment'),
('huge', 'federalism_considerations'),
('huge', 'constitutional_law_conclusion'),

('huge', 'consolidate_findings'),
('huge', 'generate_preliminary_report'),

('huge', 'legal_review'),
('huge', 'client_confidentiality_check'),
('huge', 'risk_assessment'),
('huge', 'additional_consultation'),

('huge', 'finalize_response'),
('huge', 'finish');

-- Define dependencies
insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug) values
-- Initial steps
('huge', 'start', 'parse_question'),
('huge', 'parse_question', 'determine_type'),

-- Criminal Law Route
('huge', 'determine_type', 'criminal_law_route'),
('huge', 'criminal_law_route', 'case_retrieval'),
('huge', 'case_retrieval', 'evidence_analysis'),
('huge', 'evidence_analysis', 'statute_interpretation'),
('huge', 'statute_interpretation', 'plea_options'),
('huge', 'plea_options', 'consolidate_findings'),

-- Civil Law Route
('huge', 'determine_type', 'civil_law_route'),
('huge', 'civil_law_route', 'precedent_analysis'),
('huge', 'precedent_analysis', 'liability_assessment'),
('huge', 'liability_assessment', 'damages_estimation'),
('huge', 'damages_estimation', 'settlement_options'),
('huge', 'settlement_options', 'consolidate_findings'),

-- Tax Law Route
('huge', 'determine_type', 'tax_law_route'),
('huge', 'tax_law_route', 'regulation_check'),
('huge', 'regulation_check', 'deduction_calculation'),
('huge', 'deduction_calculation', 'compliance_review'),
('huge', 'compliance_review', 'filing_guidelines'),
('huge', 'filing_guidelines', 'consolidate_findings'),

-- Intellectual Property Route
('huge', 'determine_type', 'intellectual_property_route'),
('huge', 'intellectual_property_route', 'patent_search'),
('huge', 'patent_search', 'prior_art_analysis'),
('huge', 'prior_art_analysis', 'infringement_analysis'),
('huge', 'infringement_analysis', 'legal_defense_strategy'),
('huge', 'legal_defense_strategy', 'consolidate_findings'),

-- Constitutional Law Route
('huge', 'determine_type', 'constitutional_law_route'),
('huge', 'constitutional_law_route', 'bill_of_rights_analysis'),
('huge', 'bill_of_rights_analysis', 'judicial_precedents_review'),
('huge', 'judicial_precedents_review', 'constitutional_amendments_check'),
('huge', 'constitutional_amendments_check', 'separation_of_powers_assessment'),
('huge', 'separation_of_powers_assessment', 'federalism_considerations'),
('huge', 'federalism_considerations', 'constitutional_law_conclusion'),
('huge', 'constitutional_law_conclusion', 'consolidate_findings'),

-- Post-Consolidation Steps
('huge', 'consolidate_findings', 'generate_preliminary_report'),
('huge', 'generate_preliminary_report', 'legal_review'),
('huge', 'generate_preliminary_report', 'client_confidentiality_check'),
('huge', 'generate_preliminary_report', 'risk_assessment'),
('huge', 'generate_preliminary_report', 'additional_consultation'),

-- Finalizing the response
('huge', 'legal_review', 'finalize_response'),
('huge', 'client_confidentiality_check', 'finalize_response'),
('huge', 'risk_assessment', 'finalize_response'),
('huge', 'additional_consultation', 'finalize_response'),
('huge', 'finalize_response', 'finish');

-- Additional branches with varying lengths and complexities

-- Environmental Law with internal branching
insert into pgflow.steps (flow_slug, step_slug) values
('huge', 'environmental_law_route'),
('huge', 'emission_standards_check'),
('huge', 'pollution_regulations'),
('huge', 'wildlife_protection_laws'),
('huge', 'environmental_impact_assessment'),
('huge', 'sustainability_guidelines');

insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug) values
('huge', 'determine_type', 'environmental_law_route'),
('huge', 'environmental_law_route', 'emission_standards_check'),
('huge', 'environmental_law_route', 'pollution_regulations'),
('huge', 'environmental_law_route', 'wildlife_protection_laws'),
('huge', 'emission_standards_check', 'environmental_impact_assessment'),
('huge', 'pollution_regulations', 'environmental_impact_assessment'),
('huge', 'wildlife_protection_laws', 'environmental_impact_assessment'),
('huge', 'environmental_impact_assessment', 'sustainability_guidelines'),
('huge', 'sustainability_guidelines', 'consolidate_findings');

-- Family Law with fewer steps
insert into pgflow.steps (flow_slug, step_slug) values
('huge', 'family_law_route'),
('huge', 'divorce_proceedings_review'),
('huge', 'custody_laws_analysis'),
('huge', 'asset_division_guidelines');

insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug) values
('huge', 'determine_type', 'family_law_route'),
('huge', 'family_law_route', 'divorce_proceedings_review'),
('huge', 'divorce_proceedings_review', 'custody_laws_analysis'),
('huge', 'custody_laws_analysis', 'asset_division_guidelines'),
('huge', 'asset_division_guidelines', 'consolidate_findings');

-- Corporate Law with nested steps
insert into pgflow.steps (flow_slug, step_slug) values
('huge', 'corporate_law_route'),
('huge', 'corporate_governance_analysis'),
('huge', 'mergers_acquisitions_review'),
('huge', 'shareholder_rights_assessment'),
('huge', 'compliance_audit'),
('huge', 'financial_regulations_check'),
('huge', 'antitrust_laws_review'),
('huge', 'corporate_law_conclusion');

insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug) values
('huge', 'determine_type', 'corporate_law_route'),
('huge', 'corporate_law_route', 'corporate_governance_analysis'),
('huge', 'corporate_governance_analysis', 'mergers_acquisitions_review'),
('huge', 'mergers_acquisitions_review', 'shareholder_rights_assessment'),
('huge', 'shareholder_rights_assessment', 'compliance_audit'),
('huge', 'compliance_audit', 'financial_regulations_check'),
('huge', 'financial_regulations_check', 'antitrust_laws_review'),
('huge', 'antitrust_laws_review', 'corporate_law_conclusion'),
('huge', 'corporate_law_conclusion', 'consolidate_findings');

-- International Law with many steps
insert into pgflow.steps (flow_slug, step_slug) values
('huge', 'international_law_route'),
('huge', 'treaty_analysis'),
('huge', 'cross_border_regulations'),
('huge', 'international_court_precedents'),
('huge', 'diplomatic_considerations'),
('huge', 'sanctions_review'),
('huge', 'trade_agreements_analysis'),
('huge', 'international_law_conclusion');

insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug) values
('huge', 'determine_type', 'international_law_route'),
('huge', 'international_law_route', 'treaty_analysis'),
('huge', 'treaty_analysis', 'cross_border_regulations'),
('huge', 'cross_border_regulations', 'international_court_precedents'),
('huge', 'international_court_precedents', 'diplomatic_considerations'),
('huge', 'diplomatic_considerations', 'sanctions_review'),
('huge', 'sanctions_review', 'trade_agreements_analysis'),
('huge', 'trade_agreements_analysis', 'international_law_conclusion'),
('huge', 'international_law_conclusion', 'consolidate_findings');

-- The 'consolidate_findings' step now depends on multiple branches of varying lengths and complexities.
-- This creates long-running parallel branches that converge towards the end, fulfilling your request.

