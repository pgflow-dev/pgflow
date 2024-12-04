set search_path to pgflow;

delete from pgflow.step_states where flow_slug = 'WideFlow';
delete from pgflow.runs where flow_slug = 'WideFlow';
delete from pgflow.deps where flow_slug = 'WideFlow';
delete from pgflow.steps where flow_slug = 'WideFlow';
delete from pgflow.flows where flow_slug = 'WideFlow';

insert into pgflow.flows (flow_slug) values ('WideFlow');

-- Flow: WideFlow
--
--                                 start
--                                   |
--                            download_stream
--                                   |
--             /                     |                      \
--   extract_frames            extract_audio           collect_chat_data
--       /       \                    |                      |
-- detect_scenes  detect_players   transcribe_audio       filter_spam
--     /     \          |                |                   |
-- scene_class scene_seg  |        analyze_audio_sent     analyze_chat_sent
--                        |               |                   |
--                        |        sentiment_summary          |
--                        |               |                   |
--  face_recognition  jersey_recognition  |                   |
--           \           /                |                   |
--        identify_players                 \                 /
--              |                           generate_statistics
--              |                                 |
--       generate_highlights                      |
--              |                                 |
--              \__________  _____________________/
--                         \/
--                   update_dashboard
--                          |
--                  send_notifications
--                          |
--                        finish

insert into pgflow.steps (flow_slug, step_slug) values
('WideFlow', 'start'),
('WideFlow', 'download_stream'),
('WideFlow', 'extract_frames'),
('WideFlow', 'extract_audio'),
('WideFlow', 'collect_chat_data'),
('WideFlow', 'detect_scenes'),
('WideFlow', 'detect_players'),
('WideFlow', 'transcribe_audio'),
('WideFlow', 'filter_spam'),
('WideFlow', 'scene_classification'),
('WideFlow', 'scene_segmentation'),
('WideFlow', 'face_recognition'),
('WideFlow', 'jersey_recognition'),
('WideFlow', 'identify_players'),
('WideFlow', 'analyze_audio_sentiment'),
('WideFlow', 'keyword_extraction'),
('WideFlow', 'analyze_chat_sentiment'),
('WideFlow', 'sentiment_summary'),
('WideFlow', 'generate_statistics'),
('WideFlow', 'generate_highlights'),
('WideFlow', 'update_dashboard'),
('WideFlow', 'send_notifications'),
('WideFlow', 'finish');

insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug) values
('WideFlow', 'start', 'download_stream'),
('WideFlow', 'download_stream', 'extract_frames'),
('WideFlow', 'download_stream', 'extract_audio'),
('WideFlow', 'download_stream', 'collect_chat_data'),
('WideFlow', 'extract_frames', 'detect_scenes'),
('WideFlow', 'extract_frames', 'detect_players'),
('WideFlow', 'detect_scenes', 'scene_classification'),
('WideFlow', 'detect_scenes', 'scene_segmentation'),
('WideFlow', 'detect_players', 'face_recognition'),
('WideFlow', 'detect_players', 'jersey_recognition'),
('WideFlow', 'face_recognition', 'identify_players'),
('WideFlow', 'jersey_recognition', 'identify_players'),
('WideFlow', 'extract_audio', 'transcribe_audio'),
('WideFlow', 'transcribe_audio', 'analyze_audio_sentiment'),
('WideFlow', 'transcribe_audio', 'keyword_extraction'),
('WideFlow', 'collect_chat_data', 'filter_spam'),
('WideFlow', 'filter_spam', 'analyze_chat_sentiment'),
('WideFlow', 'analyze_audio_sentiment', 'sentiment_summary'),
('WideFlow', 'analyze_chat_sentiment', 'sentiment_summary'),
('WideFlow', 'sentiment_summary', 'generate_statistics'),
('WideFlow', 'identify_players', 'generate_statistics'),
('WideFlow', 'scene_classification', 'generate_highlights'),
('WideFlow', 'scene_segmentation', 'generate_highlights'),
('WideFlow', 'keyword_extraction', 'generate_highlights'),
('WideFlow', 'identify_players', 'generate_highlights'),
('WideFlow', 'generate_statistics', 'update_dashboard'),
('WideFlow', 'generate_highlights', 'update_dashboard'),
('WideFlow', 'update_dashboard', 'send_notifications'),
('WideFlow', 'send_notifications', 'finish');
