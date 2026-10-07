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
      <AlertTitle>{zh ? '这个页面暂时无法显示' : 'This page could not be displayed'}</AlertTitle>
      <AlertDescription>
        <p>{zh ? '请重试。页面重新加载会丢失尚未保存的输入。' : 'Try again. Reloading the page clears unsaved input.'}</p>
        <Button variant="outline" className="mt-3" onClick={() => this.setState(state => ({ failed: false, attempt: state.attempt + 1 }))}>{zh ? '重新加载此页' : 'Reload this page'}</Button>
      </AlertDescription>
    </Alert>;
  }
}
