import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radii, sizes, spacing, typography } from '../theme';

type ButtonProps = {
    label?: string;
    accessibilityLabel?: string;
    onPress: () => void;
    disabled?: boolean;
};

function Button({ label, accessibilityLabel, onPress, disabled = false, secondary = false }: ButtonProps & { secondary?: boolean }) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => [styles.button, secondary && styles.secondary, (disabled || pressed) && styles.dimmed]}
        >
            <Text style={[styles.label, secondary && styles.secondaryLabel]}>{label}</Text>
        </Pressable>
    );
}

export function PrimaryButton({ label = '계속해 주세요', ...props }: ButtonProps) {
    return <Button {...props} label={label} />;
}

export function SecondaryButton({ label = '다시 시도해 주세요', ...props }: ButtonProps) {
    return <Button {...props} label={label} secondary />;
}

const styles = StyleSheet.create({
    button: {
        minHeight: sizes.button,
        minWidth: sizes.minTouch,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderRadius: radii.button,
        backgroundColor: colors.ink,
        justifyContent: 'center',
        alignItems: 'center',
    },
    secondary: { backgroundColor: colors.chip },
    label: { ...typography.label, color: colors.lime, textAlign: 'center' },
    secondaryLabel: { color: colors.ink },
    dimmed: { opacity: 0.6 },
});
