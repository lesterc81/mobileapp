import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import React, { useEffect, useRef } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

const BARCODE_TYPES: BarcodeType[] = [
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'code128',
  'code39',
  'code93',
  'itf14',
  'qr',
];

export function BarcodeScannerModal({
  visible,
  onClose,
  onScan,
}: {
  visible: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const handledRef = useRef(false);

  useEffect(() => {
    handledRef.current = false;
  }, [visible]);

  if (!visible) return null;

  const handleScan = (data: string) => {
    if (handledRef.current) return;
    handledRef.current = true;
    onScan(data);
  };

  const grant = () => {
    if (permission?.canAskAgain === false) {
      Linking.openSettings();
    } else {
      requestPermission();
    }
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.container}>
        {permission?.granted ? (
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
            onBarcodeScanned={({ data }) => handleScan(data)}
          />
        ) : (
          <View style={styles.permissionWrap}>
            <Ionicons name="camera-outline" size={48} color={colors.textMuted} />
            <Text style={styles.permissionText}>
              Camera access is needed to scan product barcodes.
            </Text>
            <Pressable style={styles.permissionBtn} onPress={grant}>
              <Text style={styles.permissionBtnText}>
                {permission?.canAskAgain === false ? 'Open Settings' : 'Grant camera access'}
              </Text>
            </Pressable>
          </View>
        )}

        <View pointerEvents="none" style={styles.overlay}>
          <View style={styles.viewfinder} />
          <Text style={styles.hint}>Point at the barcode</Text>
        </View>

        <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12} accessibilityLabel="Close scanner">
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinder: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    backgroundColor: 'transparent',
  },
  hint: {
    marginTop: spacing.lg,
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.round,
    overflow: 'hidden',
  },
  closeBtn: {
    position: 'absolute',
    top: 54,
    right: spacing.lg,
    width: 44,
    height: 44,
    borderRadius: radius.round,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.bg,
  },
  permissionText: {
    fontSize: 15,
    color: colors.text,
    textAlign: 'center',
  },
  permissionBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
  },
  permissionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});