import { describe, it, expect } from 'vitest';
import { Flow } from '../../src/dsl.js';
import { compileFlow } from '../../src/compile-flow.js';
import { AnalyzeWebsite } from '../../src/example-flow.js';

describe('compileFlow', () => {
  it('should compile a simple flow with no steps', () => {
    const flow = new Flow({ slug: 'test_flow' });
    const statements = compileFlow(flow);

    expect(statements).toHaveLength(1);
    expect(statements[0]).toBe("SELECT pgflow.create_flow('test_flow');");
  });

  it('should compile a flow with runtime options', () => {
    const flow = new Flow({
      slug: 'test_flow',
      maxAttempts: 5,
      baseDelay: 10,
      timeout: 120,
    });

    const statements = compileFlow(flow);

    expect(statements).toHaveLength(1);
    expect(statements[0]).toBe(
      "SELECT pgflow.create_flow('test_flow', max_attempts => 5, base_delay => 10, timeout => 120);"
    );
  });

  it('should compile a flow with steps', () => {
    const flow = new Flow({ slug: 'test_flow' })
      .step({ slug: 'step1' }, () => 'result1')
      .step({ slug: 'step2', dependsOn: ['step1'] }, () => 'result2');

    const statements = compileFlow(flow);

    expect(statements).toHaveLength(3);
    expect(statements[0]).toBe("SELECT pgflow.create_flow('test_flow');");
    expect(statements[1]).toBe("SELECT pgflow.add_step('test_flow', 'step1');");
    expect(statements[2]).toBe(
      "SELECT pgflow.add_step('test_flow', 'step2', ARRAY['step1']);"
    );
  });

  it('should compile a flow with steps that have runtime options', () => {
    const flow = new Flow({ slug: 'test_flow' })
      .step({ slug: 'step1', maxAttempts: 3, baseDelay: 5 }, () => 'result1')
      .step(
        { slug: 'step2', dependsOn: ['step1'], timeout: 30 },
        () => 'result2'
      );

    const statements = compileFlow(flow);

    expect(statements).toHaveLength(3);
    expect(statements[0]).toBe("SELECT pgflow.create_flow('test_flow');");
    expect(statements[1]).toBe(
      "SELECT pgflow.add_step('test_flow', 'step1', max_attempts => 3, base_delay => 5);"
    );
    expect(statements[2]).toBe(
      "SELECT pgflow.add_step('test_flow', 'step2', ARRAY['step1'], timeout => 30);"
    );
  });

  it('should compile a flow with steps that have startDelay', () => {
    const flow = new Flow({ slug: 'test_flow' })
      .step({ slug: 'step1', startDelay: 300 }, () => 'result1')
      .step(
        { slug: 'step2', dependsOn: ['step1'], startDelay: 600 },
        () => 'result2'
      );

    const statements = compileFlow(flow);

    expect(statements).toHaveLength(3);
    expect(statements[0]).toBe("SELECT pgflow.create_flow('test_flow');");
    expect(statements[1]).toBe(
      "SELECT pgflow.add_step('test_flow', 'step1', start_delay => 300);"
    );
    expect(statements[2]).toBe(
      "SELECT pgflow.add_step('test_flow', 'step2', ARRAY['step1'], start_delay => 600);"
    );
  });

  it('should compile a flow with all runtime options including startDelay', () => {
    const flow = new Flow({ slug: 'test_flow' })
      .step(
        { 
          slug: 'step1', 
          maxAttempts: 3, 
          baseDelay: 5, 
          timeout: 120,
          startDelay: 900 
        }, 
        () => 'result1'
      );

    const statements = compileFlow(flow);

    expect(statements).toHaveLength(2);
    expect(statements[0]).toBe("SELECT pgflow.create_flow('test_flow');");
    expect(statements[1]).toBe(
      "SELECT pgflow.add_step('test_flow', 'step1', max_attempts => 3, base_delay => 5, timeout => 120, start_delay => 900);"
    );
  });

  it('should compile a complex flow with multiple steps and dependencies', () => {
    const flow = new Flow({
      slug: 'complex_flow',
      maxAttempts: 5,
    })
      .step({ slug: 'step1' }, () => 'result1')
      .step({ slug: 'step2' }, () => 'result2')
      .step({ slug: 'step3', dependsOn: ['step1', 'step2'] }, () => 'result3')
      .step(
        { slug: 'step4', dependsOn: ['step3'], timeout: 60 },
        () => 'result4'
      );

    const statements = compileFlow(flow);

    expect(statements).toHaveLength(5);
    expect(statements[0]).toBe(
      "SELECT pgflow.create_flow('complex_flow', max_attempts => 5);"
    );
    expect(statements[1]).toBe(
      "SELECT pgflow.add_step('complex_flow', 'step1');"
    );
    expect(statements[2]).toBe(
      "SELECT pgflow.add_step('complex_flow', 'step2');"
    );
    expect(statements[3]).toBe(
      "SELECT pgflow.add_step('complex_flow', 'step3', ARRAY['step1', 'step2']);"
    );
    expect(statements[4]).toBe(
      "SELECT pgflow.add_step('complex_flow', 'step4', ARRAY['step3'], timeout => 60);"
    );
  });

  it('should compile the example AnalyzeWebsite flow with snapshot testing', () => {
    const statements = compileFlow(AnalyzeWebsite);

    // Use snapshot testing to verify the entire array of SQL statements
    expect(statements).toMatchInlineSnapshot(`
      [
        "SELECT pgflow.create_flow('analyze_website', max_attempts => 3, base_delay => 5, timeout => 10);",
        "SELECT pgflow.add_step('analyze_website', 'website');",
        "SELECT pgflow.add_step('analyze_website', 'sentiment', ARRAY['website'], max_attempts => 5, timeout => 30);",
        "SELECT pgflow.add_step('analyze_website', 'summary', ARRAY['website']);",
        "SELECT pgflow.add_step('analyze_website', 'saveToDb', ARRAY['sentiment', 'summary']);",
      ]
    `);
  });
});
