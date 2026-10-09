import { Component } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export class FeatureBoundary extends Component {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return <div key={this.state.attempt}>{this.props.children}</div>;
    const zh = this.props.lang !== 'en';
    return <Alert variant="destructive">
      <AlertTitle>{zh ? "加载失败" : 'This page could not be displayed'}</AlertTitle>
      <AlertDescription className="whitespace-pre-line">
        <p className="whitespace-pre-line">{zh ? "请先保留未保存的输入。\n重新加载会清空这些内容。" : 'Try again. Reloading the page clears unsaved input.'}</p>
        <Button variant="outline" className="mt-3" onClick={() => this.setState(state => ({ failed: false, attempt: state.attempt + 1 }))}>{zh ? "重新加载" : 'Reload this page'}</Button>
      </AlertDescription>
    </Alert>;
  }
}
