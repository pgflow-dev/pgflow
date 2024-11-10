set search_path to pgflow;

delete from pgflow.step_states where flow_slug = 'wide';
delete from pgflow.runs where flow_slug = 'wide';
delete from pgflow.deps where flow_slug = 'wide';
delete from pgflow.steps where flow_slug = 'wide';
delete from pgflow.flows where flow_slug = 'wide';

insert into pgflow.flows (flow_slug) values ('wide');

-- Flow: wide
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
('wide', 'start'),
('wide', 'download_stream'),
('wide', 'extract_frames'),
('wide', 'extract_audio'),
('wide', 'collect_chat_data'),
('wide', 'detect_scenes'),
('wide', 'detect_players'),
('wide', 'transcribe_audio'),
('wide', 'filter_spam'),
('wide', 'scene_classification'),
('wide', 'scene_segmentation'),
('wide', 'face_recognition'),
('wide', 'jersey_recognition'),
('wide', 'identify_players'),
('wide', 'analyze_audio_sentiment'),
('wide', 'keyword_extraction'),
('wide', 'analyze_chat_sentiment'),
('wide', 'sentiment_summary'),
('wide', 'generate_statistics'),
('wide', 'generate_highlights'),
('wide', 'update_dashboard'),
('wide', 'send_notifications'),
('wide', 'finish');

insert into pgflow.deps (flow_slug, from_step_slug, to_step_slug) values
('wide', 'start', 'download_stream'),
('wide', 'download_stream', 'extract_frames'),
('wide', 'download_stream', 'extract_audio'),
('wide', 'download_stream', 'collect_chat_data'),
('wide', 'extract_frames', 'detect_scenes'),
('wide', 'extract_frames', 'detect_players'),
('wide', 'detect_scenes', 'scene_classification'),
('wide', 'detect_scenes', 'scene_segmentation'),
('wide', 'detect_players', 'face_recognition'),
('wide', 'detect_players', 'jersey_recognition'),
('wide', 'face_recognition', 'identify_players'),
('wide', 'jersey_recognition', 'identify_players'),
('wide', 'extract_audio', 'transcribe_audio'),
('wide', 'transcribe_audio', 'analyze_audio_sentiment'),
('wide', 'transcribe_audio', 'keyword_extraction'),
('wide', 'collect_chat_data', 'filter_spam'),
('wide', 'filter_spam', 'analyze_chat_sentiment'),
('wide', 'analyze_audio_sentiment', 'sentiment_summary'),
('wide', 'analyze_chat_sentiment', 'sentiment_summary'),
('wide', 'sentiment_summary', 'generate_statistics'),
('wide', 'identify_players', 'generate_statistics'),
('wide', 'scene_classification', 'generate_highlights'),
('wide', 'scene_segmentation', 'generate_highlights'),
('wide', 'keyword_extraction', 'generate_highlights'),
('wide', 'identify_players', 'generate_highlights'),
('wide', 'generate_statistics', 'update_dashboard'),
('wide', 'generate_highlights', 'update_dashboard'),
('wide', 'update_dashboard', 'send_notifications'),
('wide', 'send_notifications', 'finish');
