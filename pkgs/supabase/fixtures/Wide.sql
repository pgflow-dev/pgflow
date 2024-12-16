set search_path to pgflow;

delete from pgflow.step_states where flow_slug = 'Wide';
delete from pgflow.runs where flow_slug = 'Wide';
delete from pgflow.deps where flow_slug = 'Wide';
delete from pgflow.steps where flow_slug = 'Wide';
delete from pgflow.flows where flow_slug = 'Wide';

insert into pgflow.flows (flow_slug) values ('Wide');

-- Flow: Wide
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
('Wide', 'start'),
('Wide', 'download_stream'),
('Wide', 'extract_frames'),
('Wide', 'extract_audio'),
('Wide', 'collect_chat_data'),
('Wide', 'detect_scenes'),
('Wide', 'detect_players'),
('Wide', 'transcribe_audio'),
('Wide', 'filter_spam'),
('Wide', 'scene_classification'),
('Wide', 'scene_segmentation'),
('Wide', 'face_recognition'),
('Wide', 'jersey_recognition'),
('Wide', 'identify_players'),
('Wide', 'analyze_audio_sentiment'),
('Wide', 'keyword_extraction'),
('Wide', 'analyze_chat_sentiment'),
('Wide', 'sentiment_summary'),
('Wide', 'generate_statistics'),
('Wide', 'generate_highlights'),
('Wide', 'update_dashboard'),
('Wide', 'send_notifications'),
('Wide', 'finish');

insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug) values
('Wide', 'start', 'download_stream'),
('Wide', 'download_stream', 'extract_frames'),
('Wide', 'download_stream', 'extract_audio'),
('Wide', 'download_stream', 'collect_chat_data'),
('Wide', 'extract_frames', 'detect_scenes'),
('Wide', 'extract_frames', 'detect_players'),
('Wide', 'detect_scenes', 'scene_classification'),
('Wide', 'detect_scenes', 'scene_segmentation'),
('Wide', 'detect_players', 'face_recognition'),
('Wide', 'detect_players', 'jersey_recognition'),
('Wide', 'face_recognition', 'identify_players'),
('Wide', 'jersey_recognition', 'identify_players'),
('Wide', 'extract_audio', 'transcribe_audio'),
('Wide', 'transcribe_audio', 'analyze_audio_sentiment'),
('Wide', 'transcribe_audio', 'keyword_extraction'),
('Wide', 'collect_chat_data', 'filter_spam'),
('Wide', 'filter_spam', 'analyze_chat_sentiment'),
('Wide', 'analyze_audio_sentiment', 'sentiment_summary'),
('Wide', 'analyze_chat_sentiment', 'sentiment_summary'),
('Wide', 'sentiment_summary', 'generate_statistics'),
('Wide', 'identify_players', 'generate_statistics'),
('Wide', 'scene_classification', 'generate_highlights'),
('Wide', 'scene_segmentation', 'generate_highlights'),
('Wide', 'keyword_extraction', 'generate_highlights'),
('Wide', 'identify_players', 'generate_highlights'),
('Wide', 'generate_statistics', 'update_dashboard'),
('Wide', 'generate_highlights', 'update_dashboard'),
('Wide', 'update_dashboard', 'send_notifications'),
('Wide', 'send_notifications', 'finish');
