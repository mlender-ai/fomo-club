import React from "react";
import { View } from "react-native";
import { Text } from "../ui/Text";
import { Colors } from "../../constants/theme";

interface State { hasError: boolean }

// Catches native SVG rendering errors (e.g. Unimplemented component: <RNSVGSvgView>)
// that occur when react-native-svg native module isn't registered in the current runtime.
export class ChartErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 32 }}>
          <Text variant="caption" color={Colors.midGrayText}>차트를 표시할 수 없습니다</Text>
        </View>
      );
    }
    return this.props.children;
  }
}
