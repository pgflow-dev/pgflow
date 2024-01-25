CREATE OR REPLACE FUNCTION no_to_int(p_number TEXT)
RETURNS INTEGER AS $$
DECLARE
    num_part INTEGER;
    letter_part CHAR;
BEGIN
    -- Check if string is empty
    IF p_number = '' THEN
        RETURN 0;
    END IF;

    -- Extract the numeric part of the string
    SELECT SUBSTRING(p_number FROM '^[0-9]+')::INTEGER INTO num_part;

    -- Check if there is a letter part
    SELECT SUBSTRING(p_number FROM '[a-zA-Z]$') INTO letter_part;

    IF letter_part IS NOT NULL THEN
        -- Return the number part multiplied by 1000 plus ASCII code of the letter
        RETURN num_part * 1000 + ASCII(letter_part);
    ELSE
        -- Return the number part multiplied by 1000
        RETURN num_part * 1000;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- In case of any error, return 0
    RETURN 0;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
